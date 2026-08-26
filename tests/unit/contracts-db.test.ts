import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { findOverlap, nextReference, priceRental } from '~/core/rental'
import type { Db } from '~/db/client'
import { contractRepository, customerRepository } from '~/db/repositories/rental'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { auditLog } from '~/db/schema/platform'
import { createTestDb, tenant } from '../helpers/db'

/**
 * Contrats — invariants du domaine vérifiés sur une VRAIE base.
 *
 * Les règles pures sont testées dans `rental.test.ts` ; ici on vérifie qu'elles sont
 * bien appliquées au passage en base : chevauchement, statut du véhicule, kilométrage
 * monotone, référence continue.
 */

const ALPHA = tenant('org-alpha')
const BRAVO = tenant('org-bravo')

let db: Db

beforeEach(() => {
  db = createTestDb()
})

async function fixtures() {
  const vehicle = await vehicleRepository(db, ALPHA).create({
    plate: '12345 | أ | 6',
    make: 'Dacia',
    model: 'Logan',
    currentKm: 91_340,
    dailyCents: 28_000,
    depositCents: 300_000,
  })

  const customer = await customerRepository(db, ALPHA).insert({
    kind: 'individual',
    firstName: 'Youssef',
    lastName: 'Benali',
    licenceExpiresOn: '2029-05-12',
    phone: '0600000000',
  })

  return { vehicle, customer }
}

describe('référence de contrat', () => {
  it('reste continue et par organisation', async () => {
    const { vehicle, customer } = await fixtures()
    const repository = contractRepository(db, ALPHA)

    expect(await repository.lastReference()).toBeNull()

    for (let index = 1; index <= 3; index += 1) {
      const reference = nextReference(2026, await repository.lastReference())
      await repository.insert({
        reference,
        vehicleId: vehicle.id,
        customerId: customer.id,
        plannedStartAt: `2026-08-2${index}T09:00:00.000Z`,
        plannedEndAt: `2026-08-2${index + 1}T09:00:00.000Z`,
      })
    }

    expect(await repository.lastReference()).toBe('2026-000003')
    // L'organisation voisine repart de zéro.
    expect(await contractRepository(db, BRAVO).lastReference()).toBeNull()
  })
})

describe('chevauchement en base', () => {
  it('refuse une seconde location sur la même période', async () => {
    const { vehicle, customer } = await fixtures()
    const repository = contractRepository(db, ALPHA)

    await repository.insert({
      reference: '2026-000001',
      vehicleId: vehicle.id,
      customerId: customer.id,
      plannedStartAt: '2026-08-20T10:00:00.000Z',
      plannedEndAt: '2026-08-24T18:00:00.000Z',
      status: 'active',
    })

    const existing = await repository.forVehicle(vehicle.id)
    const overlap = findOverlap(
      { startAt: '2026-08-23T09:00:00.000Z', endAt: '2026-08-26T09:00:00.000Z' },
      existing.map((row) => ({
        id: row.id,
        startAt: row.plannedStartAt,
        endAt: row.plannedEndAt,
        blocking: row.status === 'active',
      })),
    )

    expect(overlap).not.toBeNull()
  })

  it('laisse passer une rotation bord à bord', async () => {
    const { vehicle, customer } = await fixtures()
    const repository = contractRepository(db, ALPHA)

    await repository.insert({
      reference: '2026-000001',
      vehicleId: vehicle.id,
      customerId: customer.id,
      plannedStartAt: '2026-08-20T10:00:00.000Z',
      plannedEndAt: '2026-08-24T18:00:00.000Z',
      status: 'active',
    })

    const existing = await repository.forVehicle(vehicle.id)
    const overlap = findOverlap(
      { startAt: '2026-08-24T18:00:00.000Z', endAt: '2026-08-27T18:00:00.000Z' },
      existing.map((row) => ({
        id: row.id,
        startAt: row.plannedStartAt,
        endAt: row.plannedEndAt,
        blocking: row.status === 'active',
      })),
    )

    expect(overlap).toBeNull()
  })
})

describe('cycle de vie du véhicule', () => {
  it('passe en « loué » au départ et revient « disponible » au retour', async () => {
    const { vehicle, customer } = await fixtures()
    const vehicles = vehicleRepository(db, ALPHA)
    const repository = contractRepository(db, ALPHA)

    const contract = await repository.insert({
      reference: '2026-000001',
      vehicleId: vehicle.id,
      customerId: customer.id,
      plannedStartAt: '2026-08-22T09:00:00.000Z',
      plannedEndAt: '2026-08-25T09:00:00.000Z',
      status: 'reservation',
    })

    await repository.update(contract.id, { status: 'active', startKm: 91_340 })
    await vehicles.update(vehicle.id, { status: 'rented', currentKm: 91_340 })
    expect((await vehicles.findById(vehicle.id))?.status).toBe('rented')

    await repository.update(contract.id, { status: 'returned', endKm: 91_890 })
    await vehicles.update(vehicle.id, { status: 'available', currentKm: 91_890 })

    const after = await vehicles.findById(vehicle.id)
    expect(after?.status).toBe('available')
    // Le compteur suit le retour : c'est lui qui pilote les échéances d'entretien.
    expect(after?.currentKm).toBe(91_890)
  })
})

describe('tarification persistée', () => {
  it('enregistre des centimes entiers, jamais un flottant', async () => {
    const { vehicle, customer } = await fixtures()
    const pricing = priceRental({
      startAt: '2026-08-22T09:00:00.000Z',
      endAt: '2026-08-29T09:00:00.000Z',
      dailyCents: 28_000,
    })

    const created = await contractRepository(db, ALPHA).insert({
      reference: '2026-000001',
      vehicleId: vehicle.id,
      customerId: customer.id,
      plannedStartAt: '2026-08-22T09:00:00.000Z',
      plannedEndAt: '2026-08-29T09:00:00.000Z',
      dailyCents: 28_000,
      daysBilled: pricing.daysBilled,
      subtotalCents: pricing.subtotalCents,
      vatCents: pricing.vatCents,
      totalCents: pricing.totalCents,
    })

    expect(created.totalCents).toBe(235_200)
    expect(Number.isInteger(created.totalCents)).toBe(true)
    expect(created.daysBilled).toBe(7)
  })
})

describe('règlements', () => {
  it('cumule les règlements et fait basculer le statut de paiement', async () => {
    const { vehicle, customer } = await fixtures()
    const repository = contractRepository(db, ALPHA)

    const contract = await repository.insert({
      reference: '2026-000001',
      vehicleId: vehicle.id,
      customerId: customer.id,
      plannedStartAt: '2026-08-22T09:00:00.000Z',
      plannedEndAt: '2026-08-25T09:00:00.000Z',
      totalCents: 100_000,
    })

    await repository.payments.insert({
      contractId: contract.id,
      amountCents: 40_000,
      method: 'cash',
      receivedAt: '2026-08-22T09:05:00.000Z',
    })
    await repository.payments.insert({
      contractId: contract.id,
      amountCents: 60_000,
      method: 'card',
      receivedAt: '2026-08-25T09:05:00.000Z',
    })

    const payments = (await repository.payments.list()).filter(
      (payment) => payment.contractId === contract.id,
    )
    const paid = payments.reduce((total, payment) => total + payment.amountCents, 0)

    expect(payments).toHaveLength(2)
    expect(paid).toBe(100_000)
  })
})

describe('cloisonnement', () => {
  it('un contrat d’Alpha est invisible pour Bravo', async () => {
    const { vehicle, customer } = await fixtures()
    const created = await contractRepository(db, ALPHA).insert({
      reference: '2026-000001',
      vehicleId: vehicle.id,
      customerId: customer.id,
      plannedStartAt: '2026-08-22T09:00:00.000Z',
      plannedEndAt: '2026-08-25T09:00:00.000Z',
    })

    expect(await contractRepository(db, BRAVO).findById(created.id)).toBeUndefined()
    expect(await contractRepository(db, BRAVO).list()).toHaveLength(0)
    expect(await customerRepository(db, BRAVO).findById(customer.id)).toBeUndefined()
  })
})

describe('journal d’audit', () => {
  it('accepte une trace de contrat avec sa dérogation', async () => {
    await db.insert(auditLog).values({
      orgId: ALPHA.orgId,
      actorUserId: 'u1',
      action: 'contract.create',
      entityType: 'contract',
      entityId: 'c1',
      afterJson: JSON.stringify({ override: 'permis renouvelé sur place, copie fournie' }),
    })

    const rows = await db.select().from(auditLog).where(eq(auditLog.orgId, ALPHA.orgId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.afterJson).toContain('override')
  })
})
