import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { platformMetrics } from '~/db/repositories/platform'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { organizations } from '~/db/schema/auth'
import { invoices } from '~/db/schema/billing'
import { contracts } from '~/db/schema/contracts'
import { ensurePlans } from '~/server/plan'
import { readAgencyOverview } from '~/server/reads/overview'
import { createTestDb, tenant } from '../helpers/db'

/**
 * LES DEUX TABLEAUX DE BORD.
 *
 * Celui de l'agence (`/app`) et celui de la plateforme (`/admin`). Trois choses à
 * prouver, et la deuxième est celle qui coûte cher quand elle est fausse :
 *
 *  1. les compteurs comptent ce qu'ils prétendent compter ;
 *  2. « les retours d'aujourd'hui » se calcule en date civile de CASABLANCA, pas en
 *     date UTC — sinon un retour de fin de soirée disparaît du tableau du matin ;
 *  3. les chiffres de plateforme ne mélangent pas les devises.
 */

const ATLAS = tenant('org-atlas')
const RIVAGE = tenant('org-rivage')

let db: Db

async function organisation(
  id: string,
  overrides: Partial<typeof organizations.$inferInsert> = {},
): Promise<void> {
  await db.insert(organizations).values({
    id,
    name: `Agence ${id}`,
    slug: id,
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    planCode: 'pro',
    status: 'active',
    isDemo: false,
    ...overrides,
  })
}

async function contrat(
  ctx: typeof ATLAS,
  values: { reference: string; status: string; plannedEndAt: string },
): Promise<void> {
  await forOrg<typeof contracts.$inferSelect>(db, ctx, contracts).insert({
    reference: values.reference,
    vehicleId: 'veh',
    customerId: 'cli',
    plannedStartAt: '2026-08-20T09:00:00.000Z',
    plannedEndAt: values.plannedEndAt,
    status: values.status,
  })
}

beforeEach(async () => {
  db = await createTestDb()
  await ensurePlans(db)
  await organisation('org-atlas')
  await organisation('org-rivage', { planCode: 'starter', status: 'past_due' })
})

describe('tableau de bord de l’agence', () => {
  it('compte la flotte par état, et ignore les voitures vendues', async () => {
    const vehicles = vehicleRepository(db, ATLAS)
    await vehicles.create({ plate: '12345 | أ | 6', make: 'Dacia', model: 'Logan' })
    const rented = await vehicles.create({ plate: '12346 | ب | 6', make: 'Dacia', model: 'Sandero' })
    const sold = await vehicles.create({ plate: '12347 | ج | 6', make: 'Hyundai', model: 'i10' })
    await vehicles.update(rented.id, { status: 'rented' })
    await vehicles.update(sold.id, { status: 'sold' })

    const overview = await readAgencyOverview(db, ATLAS, new Date('2026-08-25T09:00:00.000Z'))

    // Trois voitures en base, DEUX dans la flotte : la vendue n'en fait plus partie.
    expect(overview.fleet.total).toBe(2)
    expect(overview.fleet.available).toBe(1)
    expect(overview.fleet.rented).toBe(1)
  })

  it('ne voit pas la flotte de l’agence voisine', async () => {
    await vehicleRepository(db, RIVAGE).create({
      plate: '54321 | د | 1',
      make: 'Renault',
      model: 'Clio',
    })

    const overview = await readAgencyOverview(db, ATLAS, new Date('2026-08-25T09:00:00.000Z'))
    expect(overview.fleet.total).toBe(0)
  })

  /**
   * LE test qui compte.
   *
   * `planned_end_at` est un instant UTC. Le découper avec `slice(0, 10)` donnerait la
   * date UTC — qui n'est pas la date civile marocaine une partie de l'année. Un
   * retour prévu le 25 août à 00 h 30 heure locale est encore le 24 en UTC : avec la
   * mauvaise comparaison, il disparaît du tableau du matin.
   */
  it('compte les retours du jour en date civile de Casablanca', async () => {
    // 25 août : Casablanca est à UTC+1. Minuit et demie locale = 23 h 30 UTC la veille.
    await contrat(ATLAS, {
      reference: '2026-000001',
      status: 'active',
      plannedEndAt: '2026-08-24T23:30:00.000Z',
    })
    // Et un retour en pleine journée du 25, pour être sûr qu'on n'a pas juste décalé.
    await contrat(ATLAS, {
      reference: '2026-000002',
      status: 'active',
      plannedEndAt: '2026-08-25T15:00:00.000Z',
    })
    // Celui-ci tombe le 26 en heure locale : il ne doit pas être compté.
    await contrat(ATLAS, {
      reference: '2026-000003',
      status: 'active',
      plannedEndAt: '2026-08-26T10:00:00.000Z',
    })

    const overview = await readAgencyOverview(db, ATLAS, new Date('2026-08-25T09:00:00.000Z'))
    expect(overview.contracts.dueToday).toBe(2)
    expect(overview.contracts.active).toBe(3)
  })

  it('sépare les retards, les réservations et les locations en cours', async () => {
    await contrat(ATLAS, {
      reference: '2026-000010',
      status: 'late',
      plannedEndAt: '2026-08-20T10:00:00.000Z',
    })
    await contrat(ATLAS, {
      reference: '2026-000011',
      status: 'reservation',
      plannedEndAt: '2026-09-02T10:00:00.000Z',
    })

    const overview = await readAgencyOverview(db, ATLAS, new Date('2026-08-25T09:00:00.000Z'))
    expect(overview.contracts.late).toBe(1)
    expect(overview.contracts.upcoming).toBe(1)
    expect(overview.contracts.active).toBe(0)
  })
})

describe('tableau de bord de la plateforme', () => {
  it('agrège les organisations par état et par offre', async () => {
    const metrics = await platformMetrics(db, new Date('2026-08-25T09:00:00.000Z'))

    expect(metrics.organizations.total).toBe(2)
    expect(metrics.organizations.active).toBe(1)
    expect(metrics.organizations.atRisk).toBe(1)

    // `pro` (79 900) + `starter` en impayé (29 900) : l'impayé reste facturable, il
    // est dû. C'est l'annulation qui sort du revenu, pas le retard de paiement.
    expect(metrics.mrrCents).toBe(79_900 + 29_900)
  })

  it('additionne la flotte de TOUTES les agences — c’est le seul endroit qui le fait', async () => {
    await vehicleRepository(db, ATLAS).create({
      plate: '12345 | أ | 6',
      make: 'Dacia',
      model: 'Logan',
    })
    await vehicleRepository(db, RIVAGE).create({
      plate: '54321 | د | 1',
      make: 'Renault',
      model: 'Clio',
    })

    const metrics = await platformMetrics(db, new Date('2026-08-25T09:00:00.000Z'))
    expect(metrics.fleet.vehicles).toBe(2)
  })

  /**
   * Sommer des dirhams et des euros donnerait un nombre qui ne veut rien dire, et
   * personne ne s'en apercevrait tant qu'un seul client facture en euros (règle 4).
   */
  it('ne mélange jamais deux devises', async () => {
    const repository = forOrg<typeof invoices.$inferSelect>(db, ATLAS, invoices)
    await repository.insert({
      number: '2026-000001',
      issuedOn: '2026-08-20',
      totalCents: 100_000,
      currency: 'MAD',
      status: 'paid',
    })
    await repository.insert({
      number: '2026-000002',
      issuedOn: '2026-08-21',
      totalCents: 50_000,
      currency: 'EUR',
      status: 'sent',
    })
    // Émise il y a six mois : hors de la fenêtre de trente jours.
    await repository.insert({
      number: '2026-000003',
      issuedOn: '2026-02-01',
      totalCents: 900_000,
      currency: 'MAD',
      status: 'paid',
    })

    const metrics = await platformMetrics(db, new Date('2026-08-25T09:00:00.000Z'))
    expect(metrics.revenueLast30Days).toEqual([
      { currency: 'EUR', paidCents: 0, outstandingCents: 50_000 },
      { currency: 'MAD', paidCents: 100_000, outstandingCents: 0 },
    ])
  })

  it('signale une agence créée et jamais remplie', async () => {
    const metrics = await platformMetrics(db, new Date('2026-08-25T09:00:00.000Z'))
    expect(metrics.recent).toHaveLength(2)
    expect(metrics.recent.every((row) => row.vehicles === 0)).toBe(true)
  })
})
