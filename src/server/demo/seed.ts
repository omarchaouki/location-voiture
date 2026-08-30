import { nextMaintenanceDue } from '~/core/logbook'
import { nextReference } from '~/core/rental'
import type { Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { gpsDeviceRepository } from '~/db/repositories/gps'
import { customerRepository } from '~/db/repositories/rental'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { contracts } from '~/db/schema/contracts'
import { insurancePolicies, roadTaxes, technicalInspections } from '~/db/schema/documents'
import { fines, maintenanceSchedules } from '~/db/schema/maintenance'
import type { TenantContext } from '~/db/tenant'
import { DEFAULT_DEMO_SIZE, buildDemoDataset, dayOffset, instantOffset, type DemoSize } from './dataset'

/**
 * Écrit le jeu de démonstration dans une organisation.
 *
 * Tout passe par les repositories, donc par le cloisonnement : une démo qui
 * s'écrirait par un chemin dérobé ne prouverait rien, et surtout ne serait plus
 * effaçable par le même chemin.
 *
 * La fonction est PARAMÉTRÉE par la date du jour et non par l'horloge : c'est ce qui
 * permet de tester « le jeu contient bien un contrat qui se termine demain » sans
 * attendre demain.
 */

export interface SeedResult {
  vehicles: number
  customers: number
  contracts: number
  documents: number
  fines: number
  devices: number
}

export async function seedDemoOrganization(
  db: Db,
  ctx: TenantContext,
  today: string,
  size: DemoSize = DEFAULT_DEMO_SIZE,
): Promise<SeedResult> {
  const data = buildDemoDataset(today, size)
  const year = Number(today.slice(0, 4))

  const vehicles = vehicleRepository(db, ctx)
  const customers = customerRepository(db, ctx)

  const vehicleIds: string[] = []
  for (const vehicle of data.vehicles) {
    const created = await vehicles.create({
      plate: vehicle.plate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      category: vehicle.category,
      fuel: vehicle.fuel,
      gearbox: vehicle.gearbox,
      currentKm: vehicle.currentKm,
      currentKmAt: instantOffset(today, -1, 18),
      dailyCents: vehicle.dailyCents,
      depositCents: vehicle.depositCents,
      status: vehicle.status,
    })
    vehicleIds.push(created.id)
  }

  const customerIds: string[] = []
  for (const customer of data.customers) {
    const created = await customers.insert({
      kind: 'individual',
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      city: customer.city,
      licenceNumber: customer.licenceNumber,
      licenceExpiresOn: dayOffset(today, customer.licenceExpiresInDays),
    })
    customerIds.push(created.id)
  }

  /* ------------------------------------------------------------- documents */

  let documents = 0
  const insurance = forOrg<typeof insurancePolicies.$inferSelect>(db, ctx, insurancePolicies)
  const inspections = forOrg<typeof technicalInspections.$inferSelect>(db, ctx, technicalInspections)
  const taxes = forOrg<typeof roadTaxes.$inferSelect>(db, ctx, roadTaxes)

  for (const document of data.documents) {
    const vehicleId = vehicleIds[document.vehicleIndex]
    if (!vehicleId) continue

    await insurance.insert({
      vehicleId,
      company: 'Wafa Assurance',
      policyNumber: `P-${1000 + document.vehicleIndex}`,
      expiresOn: dayOffset(today, document.insuranceExpiresInDays),
      isCurrent: true,
    })
    await inspections.insert({
      vehicleId,
      centerName: 'Centre de visite technique Anfa',
      performedOn: dayOffset(today, document.inspectionExpiresInDays - 365),
      expiresOn: dayOffset(today, document.inspectionExpiresInDays),
      isCurrent: true,
    })
    await taxes.insert({
      vehicleId,
      year,
      // Une vignette impayée est une LIGNE avec `paid_at` nul, pas une ligne absente :
      // c'est ce qui permet à la campagne annuelle de la voir (É3).
      paidAt: document.roadTaxPaid ? dayOffset(today, -40) : null,
      amountCents: 70_000,
    })
    documents += 3
  }

  /* -------------------------------------------------------------- contrats */

  const contractRepo = forOrg<typeof contracts.$inferSelect>(db, ctx, contracts)
  let reference: string | null = null
  let written = 0

  for (const contract of data.contracts) {
    const vehicleId = vehicleIds[contract.vehicleIndex]
    const customerId = customerIds[contract.customerIndex]
    if (!vehicleId || !customerId) continue

    reference = nextReference(year, reference)
    const days = Math.max(1, contract.endsInDays - contract.startsInDays)
    const subtotal = contract.dailyCents * days

    await contractRepo.insert({
      reference,
      vehicleId,
      customerId,
      plannedStartAt: instantOffset(today, contract.startsInDays, 9),
      plannedEndAt: instantOffset(today, contract.endsInDays, 18),
      actualStartAt: contract.status === 'reservation' ? null : instantOffset(today, contract.startsInDays, 9),
      actualEndAt: contract.returnedInDays === null ? null : instantOffset(today, contract.returnedInDays, 17),
      dailyCents: contract.dailyCents,
      daysBilled: days,
      subtotalCents: subtotal,
      totalCents: subtotal,
      depositCents: contract.depositCents,
      depositTakenAt: contract.status === 'reservation' ? null : instantOffset(today, contract.startsInDays, 9),
      /*
       * Caution NON restituée sur le contrat rendu il y a trois jours : c'est ce qui
       * fait vivre l'alerte `deposit.pending` à 48 h. L'historique, lui, rend les
       * siennes — sans quoi le centre de notifications ne parlerait plus que de ça.
       */
      depositReturnedAt:
        contract.depositReturnedInDays === null
          ? null
          : instantOffset(today, contract.depositReturnedInDays, 17),
      status: contract.status,
      paymentStatus: contract.status === 'returned' ? 'paid' : 'unpaid',
    })
    written += 1
  }

  /* ------------------------------------------------------------- entretien */

  const schedules = forOrg<typeof maintenanceSchedules.$inferSelect>(db, ctx, maintenanceSchedules)
  for (const entry of data.maintenance) {
    const vehicleId = vehicleIds[entry.vehicleIndex]
    if (!vehicleId) continue

    const due = nextMaintenanceDue({
      performedOn: dayOffset(today, -120),
      km: entry.lastDoneKm,
      intervalMonths: 6,
      intervalKm: entry.intervalKm,
    })

    await schedules.insert({
      vehicleId,
      kind: entry.kind,
      intervalKm: entry.intervalKm,
      intervalMonths: 6,
      lastDoneOn: dayOffset(today, -120),
      lastDoneKm: entry.lastDoneKm,
      nextDueOn: due.nextDueOn,
      nextDueKm: due.nextDueKm,
      isActive: true,
    })
  }

  /* --------------------------------------------------------------- amendes */

  const fineRepo = forOrg<typeof fines.$inferSelect>(db, ctx, fines)
  for (const fine of data.fines) {
    const vehicleId = vehicleIds[fine.vehicleIndex]
    if (!vehicleId) continue

    await fineRepo.insert({
      vehicleId,
      offenceAt: instantOffset(today, fine.occurredInDays, 14),
      amountCents: fine.amountCents,
      reason: fine.reason,
      status: 'open',
    })
  }

  /* ------------------------------------------------------------------- GPS */

  const devices = gpsDeviceRepository(db, ctx)
  for (const device of data.devices) {
    const vehicleId = vehicleIds[device.vehicleIndex]
    if (!vehicleId) continue

    await devices.insert({
      vehicleId,
      provider: 'mock',
      externalId: device.externalId,
      installedOn: dayOffset(today, -200),
      isActive: true,
    })
  }

  return {
    vehicles: vehicleIds.length,
    customers: customerIds.length,
    // Ce qui a été ÉCRIT, pas ce qui était prévu : une entrée qui désigne un véhicule
    // absent est écartée en silence, et le compte doit le dire.
    contracts: written,
    documents,
    fines: data.fines.length,
    devices: data.devices.length,
  }
}
