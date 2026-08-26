import { z } from 'zod'

/** Schémas partagés pour l'entretien, les incidents et les amendes. */

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date.invalid' })
const instant = z.string().min(10)
const cents = z.int().min(0).max(1_000_000_00)
const vehicleId = z.string().min(1)

export const MAINTENANCE_KINDS = [
  'oil_change',
  'brakes',
  'tires',
  'timing_belt',
  'filters',
  'battery',
  'general_service',
] as const

export const INCIDENT_KINDS = ['breakdown', 'accident', 'theft', 'vandalism'] as const
export const FINE_STATUSES = ['open', 'paid', 'contested', 'rebilled'] as const

/**
 * Programme d'entretien.
 *
 * Les deux intervalles sont facultatifs mais il en faut au moins un : sans borne,
 * l'entretien n'arriverait jamais à échéance et le programme ne servirait à rien.
 */
export const CreateScheduleInput = z
  .object({
    vehicleId,
    kind: z.enum(MAINTENANCE_KINDS),
    intervalKm: z.int().min(100).max(200_000).optional(),
    intervalMonths: z.int().min(1).max(120).optional(),
    lastDoneOn: civilDate.optional(),
    lastDoneKm: z.int().min(0).max(3_000_000).optional(),
  })
  .refine((value) => value.intervalKm !== undefined || value.intervalMonths !== undefined, {
    message: 'maintenance.intervalRequired',
    path: ['intervalKm'],
  })

/** Passage à l'atelier : c'est lui qui repousse la prochaine échéance. */
export const RecordMaintenanceInput = z.object({
  vehicleId,
  scheduleId: z.string().min(1).optional(),
  kind: z.enum(MAINTENANCE_KINDS),
  performedOn: civilDate,
  km: z.int().min(0).max(3_000_000).optional(),
  garageName: z.string().trim().max(80).optional(),
  invoiceNumber: z.string().trim().max(60).optional(),
  partsCents: cents.optional(),
  labourCents: cents.optional(),
  notes: z.string().trim().max(1000).optional(),
})

export const CreateIncidentInput = z.object({
  vehicleId,
  kind: z.enum(INCIDENT_KINDS),
  occurredAt: instant,
  location: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  policeReportNumber: z.string().trim().max(60).optional(),
  costCents: cents.optional(),
})

export const CloseIncidentInput = z.object({
  id: z.string().min(1),
  costCents: cents.optional(),
})

/**
 * Contravention.
 *
 * `offenceAt` porte l'HEURE, pas seulement la date : c'est elle qui permet de
 * retrouver le contrat actif à cet instant. Sans heure, le rattachement serait un
 * tirage au sort entre deux locations d'une même journée.
 */
export const CreateFineInput = z.object({
  vehicleId,
  offenceAt: instant,
  amountCents: cents.min(1),
  location: z.string().trim().max(120).optional(),
  kind: z.string().trim().max(60).optional(),
  referenceNumber: z.string().trim().max(60).optional(),
  receivedOn: civilDate.optional(),
  dueOn: civilDate.optional(),
})

export const AttachFineInput = z.object({
  id: z.string().min(1),
  /** `null` détache : on peut corriger un rattachement erroné. */
  contractId: z.string().min(1).nullable(),
})

export const SettleFineInput = z.object({
  id: z.string().min(1),
  status: z.enum(FINE_STATUSES),
  paidBy: z.enum(['company', 'customer']).optional(),
})
