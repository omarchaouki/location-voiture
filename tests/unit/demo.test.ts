import { beforeEach, describe, expect, it } from 'vitest'

import { buildDemoDataset } from '~/server/demo/dataset'
import { parsePlate } from '~/core/plate'
import type { Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { alerts } from '~/db/schema/alerts'
import { organizations } from '~/db/schema/auth'
import { notifications } from '~/db/schema/alerts'
import { runAlertScan } from '~/server/alert-scan'
import { DemoLockedError, assertNotDemo, notifyForOrganization } from '~/server/demo/locks'
import { resetDemoOrganization } from '~/server/demo/reset'
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
