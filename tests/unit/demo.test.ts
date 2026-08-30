import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_DEMO_SIZE, buildDemoDataset } from '~/server/demo/dataset'
import { parsePlate } from '~/core/plate'
import type { Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { alerts } from '~/db/schema/alerts'
import { organizations } from '~/db/schema/auth'
import { subscriptions } from '~/db/schema/billing'
import { notifications } from '~/db/schema/alerts'
import { runAlertScan } from '~/server/alert-scan'
import { DemoLockedError, assertNotDemo, notifyForOrganization } from '~/server/demo/locks'
import {
  countOrganizationRows,
  purgeOrganizationData,
  resetDemoOrganization,
} from '~/server/demo/reset'
import { seedDemoOrganization } from '~/server/demo/seed'
import { shouldResetNow } from '~/server/demo-cron'
import { setNotifier } from '~/server/notifier'
import { systemContext } from '~/server/system-context'
import { createTestDb, tenant } from '../helpers/db'

/**
 * MODE DÉMONSTRATION.
 *
 * Trois choses à prouver, et la troisième est la plus importante :
 *  1. le jeu de données est VIVANT — ses échéances tombent cette semaine ;
 *  2. la réinitialisation efface vraiment, et recompose à l'identique ;
 *  3. les verrous durs de l'invariant 11 ne laissent rien sortir.
 */

const TODAY = '2026-08-25'
const DEMO = tenant('org-demo', { planCode: 'pro', isDemo: true })

let db: Db

async function organisation(id: string, isDemo: boolean): Promise<void> {
  await db.insert(organizations).values({
    id,
    name: `Org ${id}`,
    slug: id,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    planCode: 'pro',
    status: 'active',
    isDemo,
  })
}

beforeEach(async () => {
  db = await createTestDb()
  await organisation('org-demo', true)
  await organisation('org-vrai', false)
})

describe('le jeu de données', () => {
  it('est déterministe : deux compositions donnent le même contenu', () => {
    expect(buildDemoDataset(TODAY)).toEqual(buildDemoDataset(TODAY))
  })

  /**
   * LE test qui garde la démo utile. Un jeu à dates fixes est mort le lendemain de sa
   * rédaction, et une démonstration dont toutes les échéances sont périmées ne montre
   * pas le produit — elle montre une panne.
   */
  it('est vivant : des échéances tombent dans les deux prochaines semaines', () => {
    const data = buildDemoDataset(TODAY)
    const soon = data.documents.filter(
      (document) => document.insuranceExpiresInDays > 0 && document.insuranceExpiresInDays <= 14,
    )
    expect(soon.length).toBeGreaterThanOrEqual(2)

    // Et au moins une déjà dépassée : le produit doit montrer les deux couleurs.
    expect(data.documents.some((document) => document.insuranceExpiresInDays < 0)).toBe(true)
  })

  it('contient un contrat qui se termine demain et un retour en retard', () => {
    const data = buildDemoDataset(TODAY)
    expect(data.contracts.some((contract) => contract.endsInDays === 1)).toBe(true)
    expect(
      data.contracts.some((contract) => contract.endsInDays < 0 && contract.returnedInDays === null),
    ).toBe(true)
  })

  it('n’utilise que des plaques marocaines valides', () => {
    for (const vehicle of buildDemoDataset(TODAY).vehicles) {
      expect(parsePlate(vehicle.plate), vehicle.plate).not.toBeNull()
    }
  })

  it('suit la date de référence — le même jeu, un an plus tard, reste vivant', () => {
    const later = buildDemoDataset('2027-08-25')
    expect(later.today).toBe('2027-08-25')
    // Les décalages sont relatifs : le contrat de demain est toujours celui de demain.
    expect(later.contracts.some((contract) => contract.endsInDays === 1)).toBe(true)
  })
})

/**
 * MISE À L'ÉCHELLE.
 *
 * Le jeu sert deux usages opposés : douze voitures pour la démonstration publique,
 * plusieurs dizaines pour éprouver un compte. Ce qui est vérifié ici, c'est que le
 * second ne casse aucune des propriétés du premier — ni l'unicité des plaques, ni la
 * cohérence entre le statut d'une voiture et les contrats qui la sortent.
 */
describe('mise à l’échelle', () => {
  const LARGE = { vehicles: 30, customers: 100, historyPerVehicle: 3 }

  it('laisse le jeu d’origine EXACTEMENT tel qu’il était', () => {
    // Le défaut est la taille des espaces partagés : le paramètre ne doit rien changer
    // pour eux, sans quoi la démonstration nocturne aurait mué en silence.
    expect(buildDemoDataset(TODAY)).toEqual(buildDemoDataset(TODAY, DEFAULT_DEMO_SIZE))
    expect(buildDemoDataset(TODAY).vehicles).toHaveLength(12)
    expect(buildDemoDataset(TODAY).customers).toHaveLength(8)
  })

  it('rend le volume demandé, et reste déterministe', () => {
    const data = buildDemoDataset(TODAY, LARGE)
    expect(data.vehicles).toHaveLength(30)
    expect(data.customers).toHaveLength(100)
    expect(data).toEqual(buildDemoDataset(TODAY, LARGE))
  })

  it('n’émet que des plaques marocaines valides, et toutes distinctes', () => {
    const plates = buildDemoDataset(TODAY, LARGE).vehicles.map((vehicle) => vehicle.plate)
    for (const plate of plates) expect(parsePlate(plate), plate).not.toBeNull()
    expect(new Set(plates).size).toBe(plates.length)
  })

  it('ne donne jamais deux fois le même nom à deux clients', () => {
    const names = buildDemoDataset(TODAY, LARGE).customers.map(
      (customer) => `${customer.firstName} ${customer.lastName}`,
    )
    expect(new Set(names).size).toBe(names.length)
  })

  /**
   * L'invariant qui compte vraiment. Deux contrats qui se chevauchent sur la même
   * voiture rendraient le rattachement d'une amende ambigu (`src/core/fines.ts`) et
   * feraient compter deux fois la même journée dans le chiffre d'affaires.
   */
  it('ne loue jamais la même voiture à deux moments qui se recouvrent', () => {
    const byVehicle = new Map<number, Array<{ from: number; to: number }>>()

    for (const contract of buildDemoDataset(TODAY, LARGE).contracts) {
      const windows = byVehicle.get(contract.vehicleIndex) ?? []
      windows.push({ from: contract.startsInDays, to: contract.endsInDays })
      byVehicle.set(contract.vehicleIndex, windows)
    }

    for (const [vehicleIndex, windows] of byVehicle) {
      const sorted = [...windows].sort((left, right) => left.from - right.from)
      for (let index = 1; index < sorted.length; index += 1) {
        expect(
          sorted[index]!.from,
          `véhicule ${vehicleIndex} : deux contrats se recouvrent`,
        ).toBeGreaterThan(sorted[index - 1]!.to)
      }
    }
  })

  /**
   * Une voiture « louée » sans contrat en cours est le détail qui fait douter de tout
   * l'écran : la liste des véhicules et celle des contrats doivent raconter la même
   * journée.
   */
  it('ne marque « louée » qu’une voiture qu’un contrat sort vraiment', () => {
    const data = buildDemoDataset(TODAY, LARGE)
    const out = new Set(
      data.contracts
        .filter((contract) => contract.status === 'active')
        .map((contract) => contract.vehicleIndex),
    )

    data.vehicles.forEach((vehicle, index) => {
      if (vehicle.status === 'rented') expect(out.has(index), vehicle.plate).toBe(true)
    })
  })

  /**
   * Une alerte qui sort quatre-vingt-treize fois n'est plus une alerte : c'est un mur
   * derrière lequel les sept autres catégories disparaissent. Constaté sur un compte
   * réel — chaque contrat d'historique gardait sa caution.
   */
  it('ne laisse pas l’historique noyer le centre de notifications', () => {
    const data = buildDemoDataset(TODAY, LARGE)
    const pending = data.contracts.filter(
      (contract) => contract.returnedInDays !== null && contract.depositReturnedInDays === null,
    )
    expect(pending.length).toBeLessThanOrEqual(3)
    // Mais il en reste au moins une : `deposit.pending` doit avoir de quoi exister.
    expect(pending.length).toBeGreaterThanOrEqual(1)
  })

  it('reste vivant à grande échelle : des permis et des assurances expirent', () => {
    const data = buildDemoDataset(TODAY, LARGE)
    expect(data.customers.filter((customer) => customer.licenceExpiresInDays < 0).length)
      .toBeGreaterThanOrEqual(3)
    expect(data.documents.filter((document) => document.insuranceExpiresInDays < 0).length)
      .toBeGreaterThanOrEqual(3)
  })

  it('écrit le volume demandé dans une organisation ordinaire', async () => {
    const real = tenant('org-vrai')
    const result = await seedDemoOrganization(db, real, TODAY, {
      vehicles: 15,
      customers: 20,
      historyPerVehicle: 2,
    })

    expect(result.vehicles).toBe(15)
    expect(result.customers).toBe(20)
    // Sept écrits à la main, trente d'historique, plus ce qui est dehors aujourd'hui.
    expect(result.contracts).toBeGreaterThan(35)
    expect(await vehicleRepository(db, real).count()).toBe(15)
  })
})

/**
 * LA SORTIE. Remplir un compte d'essai n'a d'intérêt que si on peut le rendre à son
 * état vide — et cette purge-là ne regarde pas `is_demo`, contrairement à la nocturne.
 */
describe('purge d’une organisation ordinaire', () => {
  it('compte ce qu’elle va effacer avant de l’effacer', async () => {
    await seedDemoOrganization(db, tenant('org-vrai'), TODAY)

    const before = await countOrganizationRows(db, 'org-vrai', 'agency-data')
    expect(before.total).toBeGreaterThan(30)
    expect(before.byTable['vehicles']).toBe(12)
    expect(before.byTable['customers']).toBe(8)
  })

  it('vide la cible et ne touche pas à la voisine', async () => {
    await seedDemoOrganization(db, tenant('org-vrai'), TODAY)
    await seedDemoOrganization(db, DEMO, TODAY)

    await purgeOrganizationData(db, 'org-vrai', 'agency-data')

    expect((await countOrganizationRows(db, 'org-vrai', 'agency-data')).total).toBe(0)
    expect(await vehicleRepository(db, DEMO).count()).toBe(12)
  })

  /**
   * LE test qui protège un vrai compte.
   *
   * Écrit après coup, et pas par prudence théorique : la première version de
   * `pnpm demo:fill` s'apprêtait à effacer l'abonnement d'un compte en essai avec sa
   * flotte. Un compte vivant, connecté, sans offre ni date de fin d'essai — et rien
   * dans le produit ne sait lui en rendre un.
   */
  it('épargne l’abonnement du compte, et la nocturne continue de tout prendre', async () => {
    const real = tenant('org-vrai')
    const abonnement = forOrg<typeof subscriptions.$inferSelect>(db, real, subscriptions)
    await abonnement.insert({ planCode: 'starter', status: 'trialing' })

    await seedDemoOrganization(db, real, TODAY)
    await purgeOrganizationData(db, 'org-vrai', 'agency-data')

    expect(await vehicleRepository(db, real).count()).toBe(0)
    expect(await abonnement.count()).toBe(1)

    // La réinitialisation des espaces partagés, elle, ne garde rien.
    await purgeOrganizationData(db, 'org-vrai', 'everything')
    expect(await abonnement.count()).toBe(0)
  })
})

describe('écriture en base', () => {
  it('peuple une agence complète et cloisonnée', async () => {
    const result = await seedDemoOrganization(db, DEMO, TODAY)

    expect(result.vehicles).toBe(12)
    expect(result.customers).toBe(8)
    expect(await vehicleRepository(db, DEMO).count()).toBe(12)

    // Rien n'a débordé chez le voisin.
    expect(await vehicleRepository(db, tenant('org-vrai')).count()).toBe(0)
  })

  /**
   * Le jeu doit donner du grain à moudre au moteur d'alertes : c'est l'écran le plus
   * utile du produit, et une démonstration qui l'affiche vide ne montre rien.
   */
  it('produit des alertes dans plusieurs catégories', async () => {
    await seedDemoOrganization(db, DEMO, TODAY)
    /*
      Le balayage regarde la MÊME date que celle qui a semé le jeu.

      Sans cet argument, il lisait l'horloge réelle : les échéances semées au 25/08
      sortaient de leurs seuils à mesure que le vrai calendrier s'en éloignait, et ce
      test passait le lendemain pour échouer le surlendemain. Constaté le 27/08/2026.
    */
    await runAlertScan(db, DEMO, new Date(`${TODAY}T12:00:00.000Z`))

    const rows = await forOrg<typeof alerts.$inferSelect>(db, DEMO, alerts).list()
    const types = new Set(rows.map((row) => row.alertType))

    expect(rows.length).toBeGreaterThan(5)
    expect(types.has('insurance.expiry')).toBe(true)
    expect(types.has('contract.ending')).toBe(true)
    expect(types.size).toBeGreaterThanOrEqual(4)
  })
})

describe('réinitialisation', () => {
  it('efface tout puis recompose à l’identique', async () => {
    await seedDemoOrganization(db, DEMO, TODAY)
    const vehicles = vehicleRepository(db, DEMO)

    // Un visiteur passe et laisse des traces.
    await vehicles.create({ plate: '99999 | و | 20', make: 'Test', model: 'Visiteur' })
    expect(await vehicles.count()).toBe(13)

    await resetDemoOrganization(db, 'org-demo', 'pro', TODAY)

    // Douze voitures, et la voiture du visiteur a disparu.
    expect(await vehicles.count()).toBe(12)
    const plates = (await vehicles.list()).map((row) => row.plate)
    expect(plates.some((plate) => plate.includes('99999'))).toBe(false)
  })

  it('ne touche pas aux organisations qui ne sont pas des démos', async () => {
    const real = tenant('org-vrai')
    await vehicleRepository(db, real).create({
      plate: '12345 | أ | 6',
      make: 'Dacia',
      model: 'Logan',
    })

    await resetDemoOrganization(db, 'org-demo', 'pro', TODAY)
    expect(await vehicleRepository(db, real).count()).toBe(1)
  })
})

describe('verrous durs (invariant 11)', () => {
  /**
   * Le verrou n'est PAS un silence : la notification est enregistrée avec l'état
   * `skipped_demo`. La démonstration doit montrer qu'un courriel serait parti, sans
   * en envoyer un seul.
   */
  it('enregistre la notification d’une démo sans jamais l’envoyer', async () => {
    let sent = 0
    setNotifier({
      id: 'compteur',
      send() {
        sent += 1
        return Promise.resolve()
      },
    })

    const result = await notifyForOrganization(db, 'org-demo', {
      to: 'visiteur@example.ma',
      subject: 'Invitation',
      body: 'Bonjour',
      locale: 'fr',
    })

    expect(result.state).toBe('skipped_demo')
    expect(sent).toBe(0)

    const rows = await forOrg<typeof notifications.$inferSelect>(
      db,
      systemContext('org-demo', 'pro'),
      notifications,
    ).list()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.state).toBe('skipped_demo')
  })

  it('envoie normalement pour une vraie organisation, et le trace', async () => {
    let sent = 0
    setNotifier({
      id: 'compteur',
      send() {
        sent += 1
        return Promise.resolve()
      },
    })

    const result = await notifyForOrganization(db, 'org-vrai', {
      to: 'gerant@atlas.ma',
      subject: 'Invitation',
      body: 'Bonjour',
      locale: 'fr',
    })

    expect(result.state).toBe('sent')
    expect(sent).toBe(1)
  })

  it('trace un échec d’envoi au lieu de le perdre', async () => {
    setNotifier({
      id: 'cassé',
      send() {
        return Promise.reject(new Error('SMTP indisponible'))
      },
    })

    const result = await notifyForOrganization(db, 'org-vrai', {
      to: 'gerant@atlas.ma',
      subject: 'Invitation',
      body: 'Bonjour',
      locale: 'fr',
    })

    expect(result.state).toBe('failed')
  })

  it('refuse un acte sortant dans une démo, et le nomme', async () => {
    await expect(assertNotDemo(db, 'org-demo', 'export.bulk')).rejects.toBeInstanceOf(
      DemoLockedError,
    )
    await expect(assertNotDemo(db, 'org-vrai', 'export.bulk')).resolves.toBeUndefined()
  })
})

describe('heure de réinitialisation', () => {
  /**
   * Le cron regarde l'heure de CASABLANCA, jamais celle du serveur. C'est ce qui le
   * met à l'abri du passage à UTC+0 pendant le Ramadan (docs/DECISIONS.md É7) : un
   * offset codé en dur décalerait la réinitialisation d'une heure la moitié de l'année.
   */
  it('déclenche à 3 h locales, en heure d’été comme en heure de Ramadan', () => {
    // 25 août : Casablanca est à UTC+1, donc 3 h locales = 2 h UTC.
    expect(shouldResetNow(new Date('2026-08-25T02:00:00.000Z'), 3)).toBe(true)
    expect(shouldResetNow(new Date('2026-08-25T03:00:00.000Z'), 3)).toBe(false)

    // 1er mars, pendant le Ramadan : Casablanca est à UTC+0, donc 3 h locales = 3 h UTC.
    expect(shouldResetNow(new Date('2026-03-01T03:00:00.000Z'), 3)).toBe(true)
    expect(shouldResetNow(new Date('2026-03-01T02:00:00.000Z'), 3)).toBe(false)
  })
})
