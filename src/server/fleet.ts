import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { notFound } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { attachFine, canRebill, type FineAttachment, type FineCandidate } from '~/core/fines'
import { nextMaintenanceDue } from '~/core/logbook'
import { formatPlate, parsePlate } from '~/core/plate'
import {
  AttachFineInput,
  CloseIncidentInput,
  CreateFineInput,
  CreateIncidentInput,
  CreateScheduleInput,
  RecordMaintenanceInput,
  SettleFineInput,
} from '~/core/schemas/fleet'
import { getDb } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { contractRepository, customerRepository } from '~/db/repositories/rental'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { fines, incidents, maintenanceRecords, maintenanceSchedules } from '~/db/schema/maintenance'
import { audit } from './audit'
import { tenantMiddleware, writableTenantMiddleware } from './middleware'

/**
 * Entretien, incidents et amendes.
 *
 * La pièce maîtresse est le rattachement automatique d'une contravention au contrat
 * actif à l'instant de l'infraction — et son refus de deviner quand il y a un doute.
 */

type ScheduleRow = typeof maintenanceSchedules.$inferSelect
type RecordRow = typeof maintenanceRecords.$inferSelect
type IncidentRow = typeof incidents.$inferSelect
type FineRow = typeof fines.$inferSelect

/* ---------------------------------------------------------------- entretien */

export const createSchedule = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CreateScheduleInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant

    const vehicle = await vehicleRepository(db, tenant).findById(data.vehicleId)
    if (!vehicle) throw notFound()

    // Les échéances sont dénormalisées : c'est elles que balaie le moteur d'alertes.
    const due = nextMaintenanceDue({
      performedOn: data.lastDoneOn ?? new Date().toISOString().slice(0, 10),
      km: data.lastDoneKm ?? vehicle.currentKm,
      intervalMonths: data.intervalMonths ?? null,
      intervalKm: data.intervalKm ?? null,
    })

    const created = await forOrg<ScheduleRow>(db, tenant, maintenanceSchedules).insert({
      ...data,
      lastDoneKm: data.lastDoneKm ?? vehicle.currentKm,
      nextDueOn: due.nextDueOn,
      nextDueKm: due.nextDueKm,
      isActive: true,
    })

    return { id: created.id, nextDueOn: due.nextDueOn, nextDueKm: due.nextDueKm }
  })

/**
 * Passage à l'atelier.
 *
 * Deux effets : la dépense est enregistrée, et l'échéance suivante est REPOUSSÉE à
 * partir de ce passage. Oublier le second, c'est laisser une alerte de vidange
 * ouverte alors que la vidange est faite.
 */
export const recordMaintenance = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(RecordMaintenanceInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant

    const vehicle = await vehicleRepository(db, tenant).findById(data.vehicleId)
    if (!vehicle) throw notFound()

    const totalCents = (data.partsCents ?? 0) + (data.labourCents ?? 0)
    const created = await forOrg<RecordRow>(db, tenant, maintenanceRecords).insert({
      ...data,
      km: data.km ?? vehicle.currentKm,
      partsCents: data.partsCents ?? 0,
      labourCents: data.labourCents ?? 0,
      totalCents,
    })

    const schedules = forOrg<ScheduleRow>(db, tenant, maintenanceSchedules)
    const target = data.scheduleId
      ? await schedules.findById(data.scheduleId)
      : (await schedules.list(eq(maintenanceSchedules.vehicleId, data.vehicleId))).find(
          (row) => row.kind === data.kind && row.isActive,
        )

    if (target) {
      const due = nextMaintenanceDue({
        performedOn: data.performedOn,
        km: data.km ?? vehicle.currentKm,
        intervalMonths: target.intervalMonths,
        intervalKm: target.intervalKm,
      })
      await schedules.update(target.id, {
        lastDoneOn: data.performedOn,
        lastDoneKm: data.km ?? vehicle.currentKm,
        nextDueOn: due.nextDueOn,
        nextDueKm: due.nextDueKm,
      })
    }

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'maintenance.record',
      entityType: 'vehicle',
      entityId: data.vehicleId,
      after: { kind: data.kind, performedOn: data.performedOn, totalCents },
      request: { ip: getRequestIP() ?? null },
    })

    return { id: created.id, rescheduled: target !== undefined }
  })

/* --------------------------------------------------------------- incidents */

export const createIncident = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CreateIncidentInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant

    const vehicle = await vehicleRepository(db, tenant).findById(data.vehicleId)
    if (!vehicle) throw notFound()

    // Un incident survient pendant une location dans la plupart des cas : on le
    // rattache par la même règle que les amendes, sans deviner.
    const attachment = await resolveAttachment(tenant, data.vehicleId, data.occurredAt)

    const created = await forOrg<IncidentRow>(db, tenant, incidents).insert({
      ...data,
      contractId: attachment.kind === 'attached' ? attachment.contract.id : null,
      status: 'open',
    })

    // Un vol ou un accident immobilise la voiture : le statut doit suivre tout seul.
    if (data.kind === 'theft' || data.kind === 'accident') {
      await vehicleRepository(db, tenant).update(data.vehicleId, { status: 'out_of_service' })
    }

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'incident.create',
      entityType: 'vehicle',
      entityId: data.vehicleId,
      after: { kind: data.kind, occurredAt: data.occurredAt },
      request: { ip: getRequestIP() ?? null },
    })

    return { id: created.id, attachedTo: attachment.kind === 'attached' ? attachment.contract.reference : null }
  })

export const closeIncident = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CloseIncidentInput)
  .handler(async ({ data, context }) => {
    const updated = await forOrg<IncidentRow>(getDb(), context.tenant, incidents).update(data.id, {
      status: 'closed',
      ...(data.costCents === undefined ? {} : { costCents: data.costCents }),
    })
    if (!updated) throw notFound()
    return { ok: true }
  })

/* ----------------------------------------------------------------- amendes */

async function resolveAttachment(
  tenant: Parameters<typeof vehicleRepository>[1],
  vehicleId: string,
  offenceAt: string,
): Promise<FineAttachment> {
  const db = getDb()
  const contracts = await contractRepository(db, tenant).forVehicle(vehicleId)
  const customers = customerRepository(db, tenant)
  const rows = await customers.list()
  const labelOf = new Map(rows.map((row) => [row.id, customers.label(row)]))

  const candidates: FineCandidate[] = contracts.map((row) => ({
    id: row.id,
    reference: row.reference,
    customerId: row.customerId,
    customerLabel: labelOf.get(row.customerId) ?? row.customerId,
    // Le départ RÉEL fait foi ; à défaut le prévu, pour les contrats pas encore partis.
    startAt: row.actualStartAt ?? row.plannedStartAt,
    endAt: row.actualEndAt,
    status: row.status,
  }))

  return attachFine(offenceAt, candidates)
}

export interface FineView {
  id: string
  vehicleId: string
  vehicleLabel: string
  offenceAt: string
  amountCents: number
  location: string | null
  status: string
  contractId: string | null
  contractReference: string | null
  customerLabel: string | null
  paidBy: string | null
  dueOn: string | null
}

export const listFines = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<FineView[]> => {
    const db = getDb()
    const tenant = context.tenant

    const [rows, vehicles, contracts, customerRows] = await Promise.all([
      forOrg<FineRow>(db, tenant, fines).list(),
      vehicleRepository(db, tenant).list(),
      contractRepository(db, tenant).list(),
      customerRepository(db, tenant).list(),
    ])

    const customers = customerRepository(db, tenant)
    const vehicleById = new Map(vehicles.map((row) => [row.id, row]))
    const contractById = new Map(contracts.map((row) => [row.id, row]))
    const customerLabel = new Map(customerRows.map((row) => [row.id, customers.label(row)]))

    return rows
      .map((row) => {
        const vehicle = vehicleById.get(row.vehicleId)
        const parsed = vehicle ? parsePlate(vehicle.plate) : null
        const contract = row.contractId ? contractById.get(row.contractId) : undefined

        return {
          id: row.id,
          vehicleId: row.vehicleId,
          vehicleLabel: vehicle
            ? `${parsed ? formatPlate(parsed) : vehicle.plate} — ${vehicle.make} ${vehicle.model}`
            : row.vehicleId,
          offenceAt: row.offenceAt,
          amountCents: row.amountCents,
          location: row.location,
          status: row.status,
          contractId: row.contractId,
          contractReference: contract?.reference ?? null,
          customerLabel: contract ? (customerLabel.get(contract.customerId) ?? null) : null,
          paidBy: row.paidBy,
          dueOn: row.dueOn,
        }
      })
      .sort((a, b) => b.offenceAt.localeCompare(a.offenceAt))
  })

/**
 * Enregistrement d'une contravention.
 *
 * Le rattachement est tenté immédiatement. S'il est ambigu ou introuvable, l'amende
 * est créée SANS contrat et l'écran demande de choisir. On préfère une amende non
 * rattachée à une amende facturée au mauvais client.
 */
export const createFine = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CreateFineInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant

    const vehicle = await vehicleRepository(db, tenant).findById(data.vehicleId)
    if (!vehicle) throw notFound()

    const attachment = await resolveAttachment(tenant, data.vehicleId, data.offenceAt)
    const contractId = attachment.kind === 'attached' ? attachment.contract.id : null

    const created = await forOrg<FineRow>(db, tenant, fines).insert({
      ...data,
      contractId,
      status: 'open',
    })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'fine.create',
      entityType: 'vehicle',
      entityId: data.vehicleId,
      after: {
        offenceAt: data.offenceAt,
        amountCents: data.amountCents,
        attachment: attachment.kind,
        contractId,
      },
      request: { ip: getRequestIP() ?? null },
    })

    return {
      id: created.id,
      attachment: attachment.kind,
      candidates:
        attachment.kind === 'ambiguous'
          ? attachment.candidates.map((candidate) => ({
              id: candidate.id,
              reference: candidate.reference,
              customerLabel: candidate.customerLabel,
            }))
          : [],
    }
  })

/** Rattachement manuel — ou détachement, pour corriger une erreur. */
export const attachFineToContract = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(AttachFineInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const updated = await forOrg<FineRow>(getDb(), tenant, fines).update(data.id, {
      contractId: data.contractId,
    })
    if (!updated) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: data.contractId ? 'fine.attach' : 'fine.detach',
      entityType: 'fine',
      entityId: data.id,
      after: { contractId: data.contractId },
      request: { ip: getRequestIP() ?? null },
    })

    return { ok: true }
  })

export const settleFine = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(SettleFineInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    const repository = forOrg<FineRow>(db, tenant, fines)

    const fine = await repository.findById(data.id)
    if (!fine) throw notFound()

    // Refacturer suppose un rattachement : sinon on choisirait un client au hasard.
    if (
      data.status === 'rebilled' &&
      !canRebill({ contractId: fine.contractId, status: fine.status as 'open' })
    ) {
      throw new Error('fine.cannotRebill')
    }

    await repository.update(data.id, {
      status: data.status,
      paidBy: data.paidBy ?? fine.paidBy,
      paidAt: data.status === 'paid' ? new Date().toISOString().slice(0, 10) : fine.paidAt,
    })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'fine.settle',
      entityType: 'fine',
      entityId: data.id,
      after: { status: data.status, paidBy: data.paidBy ?? null },
      request: { ip: getRequestIP() ?? null },
    })

    return { ok: true }
  })
