import { beforeEach, describe, expect, it } from 'vitest'

import { attachFine, type FineCandidate } from '~/core/fines'
import { nextMaintenanceDue } from '~/core/logbook'
import type { Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { contractRepository, customerRepository } from '~/db/repositories/rental'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { fines, maintenanceSchedules } from '~/db/schema/maintenance'
import { createTestDb, tenant } from '../helpers/db'

/**
 * Entretien et amendes, sur une vraie base.
 *
 * On vérifie ici ce que les tests purs ne peuvent pas voir : que le rattachement
 * utilise le départ RÉEL quand il existe, et que l'échéance d'entretien est bien
 * repoussée après un passage à l'atelier.
 */

const ALPHA = tenant('org-alpha')
const BRAVO = tenant('org-bravo')

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function fleet() {
  const vehicle = await vehicleRepository(db, ALPHA).create({
    plate: '12345 | أ | 6',
    make: 'Dacia',
    model: 'Logan',
    currentKm: 91_340,
  })
  const customer = await customerRepository(db, ALPHA).insert({
    kind: 'individual',
    firstName: 'Youssef',
    lastName: 'Benali',
  })
  return { vehicle, customer }
}

/** Reconstruit les candidats comme le fait `resolveAttachment` côté serveur. */
async function candidates(vehicleId: string): Promise<FineCandidate[]> {
  const contracts = await contractRepository(db, ALPHA).forVehicle(vehicleId)
  const customers = customerRepository(db, ALPHA)
  const rows = await customers.list()
  const labels = new Map(rows.map((row) => [row.id, customers.label(row)]))

  return contracts.map((row) => ({
    id: row.id,
    reference: row.reference,
    customerId: row.customerId,
    customerLabel: labels.get(row.customerId) ?? row.customerId,
    startAt: row.actualStartAt ?? row.plannedStartAt,
    endAt: row.actualEndAt,
    status: row.status,
  }))
}

describe('rattachement d’une amende en base', () => {
  it('trouve le client qui avait la voiture à cet instant', async () => {
    const { vehicle, customer } = await fleet()
    await contractRepository(db, ALPHA).insert({
      reference: '2026-000241',
      vehicleId: vehicle.id,
      customerId: customer.id,
      plannedStartAt: '2026-08-20T10:00:00.000Z',
      plannedEndAt: '2026-08-24T18:00:00.000Z',
      actualStartAt: '2026-08-20T10:15:00.000Z',
      actualEndAt: '2026-08-24T17:40:00.000Z',
      status: 'returned',
    })

    const result = attachFine('2026-08-22T14:30:00.000Z', await candidates(vehicle.id))
    expect(result.kind).toBe('attached')
    if (result.kind === 'attached') {
      expect(result.contract.customerLabel).toBe('Youssef Benali')
    }
  })

  /**
   * Le départ RÉEL fait foi. Une infraction commise entre le départ prévu et le
   * départ réel n'est pas du fait du client : la voiture était encore à l'agence.
   */
  it('utilise le départ réel plutôt que le départ prévu', async () => {
    const { vehicle, customer } = await fleet()
    await contractRepository(db, ALPHA).insert({
      reference: '2026-000241',
      vehicleId: vehicle.id,
      customerId: customer.id,
      plannedStartAt: '2026-08-20T08:00:00.000Z',
      plannedEndAt: '2026-08-24T18:00:00.000Z',
      actualStartAt: '2026-08-20T14:00:00.000Z',
      actualEndAt: null,
      status: 'active',
    })

    const before = attachFine('2026-08-20T10:00:00.000Z', await candidates(vehicle.id))
    const after = attachFine('2026-08-20T15:00:00.000Z', await candidates(vehicle.id))

    expect(before.kind).toBe('none')
    expect(after.kind).toBe('attached')
  })

  it('n’attache rien quand la voiture était à l’agence', async () => {
    const { vehicle, customer } = await fleet()
    await contractRepository(db, ALPHA).insert({
      reference: '2026-000241',
      vehicleId: vehicle.id,
      customerId: customer.id,
      plannedStartAt: '2026-08-20T10:00:00.000Z',
      plannedEndAt: '2026-08-24T18:00:00.000Z',
      actualStartAt: '2026-08-20T10:00:00.000Z',
      actualEndAt: '2026-08-24T18:00:00.000Z',
      status: 'returned',
    })

    expect(attachFine('2026-08-26T09:00:00.000Z', await candidates(vehicle.id)).kind).toBe('none')
  })
})

describe('entretien', () => {
  it('repousse l’échéance après un passage à l’atelier', async () => {
    const { vehicle } = await fleet()
    const schedules = forOrg<typeof maintenanceSchedules.$inferSelect>(
      db,
      ALPHA,
      maintenanceSchedules,
    )

    const created = await schedules.insert({
      vehicleId: vehicle.id,
      kind: 'oil_change',
      intervalKm: 10_000,
      intervalMonths: 6,
      lastDoneOn: '2026-03-14',
      lastDoneKm: 84_000,
      nextDueOn: '2026-09-14',
      nextDueKm: 94_000,
      isActive: true,
    })

    const due = nextMaintenanceDue({
      performedOn: '2026-08-22',
      km: 91_340,
      intervalMonths: created.intervalMonths,
      intervalKm: created.intervalKm,
    })
    await schedules.update(created.id, {
      lastDoneOn: '2026-08-22',
      lastDoneKm: 91_340,
      nextDueOn: due.nextDueOn,
      nextDueKm: due.nextDueKm,
    })

    const after = await schedules.findById(created.id)
    expect(after?.nextDueOn).toBe('2027-02-22')
    expect(after?.nextDueKm).toBe(101_340)
  })
})

describe('cloisonnement', () => {
  it('les amendes et les entretiens restent dans leur organisation', async () => {
    const { vehicle } = await fleet()
    await forOrg<typeof fines.$inferSelect>(db, ALPHA, fines).insert({
      vehicleId: vehicle.id,
      offenceAt: '2026-08-22T14:30:00.000Z',
      amountCents: 70_000,
      status: 'open',
    })

    expect(await forOrg(db, ALPHA, fines).list()).toHaveLength(1)
    expect(await forOrg(db, BRAVO, fines).list()).toHaveLength(0)
  })
})
