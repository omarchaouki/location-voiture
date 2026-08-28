import { index, integer, pgTable, text } from 'drizzle-orm/pg-core'

import { bool, cents, civilDate, orgColumns, timestamp } from './_shared'

export const maintenanceSchedules = pgTable(
  'maintenance_schedules',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    /** oil_change | brakes | tires | timing_belt | filters | battery | general_service */
    kind: text('kind').notNull(),
    /** L'échéance tombe au PREMIER des deux seuils atteint : kilomètres ou temps. */
    intervalKm: integer('interval_km'),
    intervalMonths: integer('interval_months'),
    lastDoneOn: civilDate('last_done_on'),
    lastDoneKm: integer('last_done_km'),
    /** Dénormalisés, recalculés à chaque mutation : c'est ce que balaie le moteur d'alertes. */
    nextDueKm: integer('next_due_km'),
    nextDueOn: civilDate('next_due_on'),
    isActive: bool('is_active').notNull().default(true),
  },
  (table) => [
    index('maintenance_due_idx').on(table.orgId, table.isActive, table.nextDueOn),
    index('maintenance_vehicle_idx').on(table.orgId, table.vehicleId),
  ],
)

export const maintenanceRecords = pgTable(
  'maintenance_records',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    scheduleId: text('schedule_id'),
    kind: text('kind').notNull(),
    performedOn: civilDate('performed_on').notNull(),
    km: integer('km'),
    garageName: text('garage_name'),
    invoiceNumber: text('invoice_number'),
    partsCents: cents('parts_cents').notNull().default(0),
    labourCents: cents('labour_cents').notNull().default(0),
    totalCents: cents('total_cents').notNull().default(0),
    currency: text('currency').notNull().default('MAD'),
    notes: text('notes'),
    scanPath: text('scan_path'),
  },
  (table) => [index('maintenance_records_vehicle_idx').on(table.orgId, table.vehicleId)],
)

export const incidents = pgTable(
  'incidents',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    contractId: text('contract_id'),
    /** breakdown | accident | theft | vandalism */
    kind: text('kind').notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
    location: text('location'),
    description: text('description'),
    thirdPartyJson: text('third_party_json'),
    policeReportNumber: text('police_report_number'),
    costCents: cents('cost_cents'),
    insuranceClaimNumber: text('insurance_claim_number'),
    /** open | in_progress | closed */
    status: text('status').notNull().default('open'),
  },
  (table) => [
    index('incidents_vehicle_idx').on(table.orgId, table.vehicleId),
    index('incidents_status_idx').on(table.orgId, table.status, table.occurredAt),
  ],
)

/**
 * Contravention.
 *
 * `offenceAt` porte l'HEURE, et pas seulement la date : c'est elle qui permet de
 * retrouver le contrat actif à cet instant. Le rattachement n'est proposé que s'il y a
 * EXACTEMENT un contrat candidat ; sinon l'amende reste non rattachée avec une invite.
 * Deviner ici, c'est refacturer une amende au mauvais client.
 */
export const fines = pgTable(
  'fines',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    contractId: text('contract_id'),
    offenceAt: timestamp('offence_at').notNull(),
    location: text('location'),
    kind: text('kind'),
    referenceNumber: text('reference_number'),
    amountCents: cents('amount_cents').notNull(),
    currency: text('currency').notNull().default('MAD'),
    receivedOn: civilDate('received_on'),
    dueOn: civilDate('due_on'),
    paidAt: civilDate('paid_at'),
    /** company | customer */
    paidBy: text('paid_by'),
    rebilledContractPaymentId: text('rebilled_contract_payment_id'),
    /** open | paid | contested | rebilled */
    status: text('status').notNull().default('open'),
    scanPath: text('scan_path'),
  },
  (table) => [
    index('fines_vehicle_time_idx').on(table.orgId, table.vehicleId, table.offenceAt),
    index('fines_status_idx').on(table.orgId, table.status, table.dueOn),
  ],
)
