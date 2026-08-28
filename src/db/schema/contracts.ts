import { index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

import { aliveOnly, cents, orgColumns, timestamp } from './_shared'

export const contracts = pgTable(
  'contracts',
  {
    ...orgColumns,
    /** Séquence par organisation, ex. `2026-000241`. Affichée en chiffres tabulaires. */
    reference: text('reference').notNull(),

    vehicleId: text('vehicle_id').notNull(),
    customerId: text('customer_id').notNull(),
    additionalDriverCustomerId: text('additional_driver_customer_id'),
    pickupBranchId: text('pickup_branch_id'),
    returnBranchId: text('return_branch_id'),

    plannedStartAt: timestamp('planned_start_at').notNull(),
    plannedEndAt: timestamp('planned_end_at').notNull(),
    actualStartAt: timestamp('actual_start_at'),
    actualEndAt: timestamp('actual_end_at'),

    startKm: integer('start_km'),
    endKm: integer('end_km'),
    /** Niveau de carburant en HUITIÈMES (0..8) : c'est ce que lit une jauge. */
    startFuelEighths: integer('start_fuel_eighths'),
    endFuelEighths: integer('end_fuel_eighths'),

    dailyCents: cents('daily_cents').notNull().default(0),
    daysBilled: integer('days_billed').notNull().default(0),
    discountCents: cents('discount_cents').notNull().default(0),
    extrasCents: cents('extras_cents').notNull().default(0),
    subtotalCents: cents('subtotal_cents').notNull().default(0),
    vatCents: cents('vat_cents').notNull().default(0),
    totalCents: cents('total_cents').notNull().default(0),
    currency: text('currency').notNull().default('MAD'),

    depositCents: cents('deposit_cents').notNull().default(0),
    /** cash | cheque | card_imprint | transfer */
    depositMethod: text('deposit_method'),
    depositTakenAt: timestamp('deposit_taken_at'),
    depositReturnedAt: timestamp('deposit_returned_at'),
    depositWithheldCents: cents('deposit_withheld_cents').notNull().default(0),

    /** unpaid | partial | paid */
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    /**
     * reservation | active | returned | late | cancelled.
     * `late` n'est jamais saisi : il est calculé par le moteur d'alertes, pour qu'un
     * retard soit visible même si personne n'a ouvert l'application.
     */
    status: text('status').notNull().default('reservation'),

    signaturePath: text('signature_path'),
    contractPdfPath: text('contract_pdf_path'),
    cancelReason: text('cancel_reason'),
  },
  (table) => [
    uniqueIndex('contracts_reference_unique').on(table.orgId, table.reference).where(aliveOnly),
    // Chevauchement de contrats et rattachement automatique des amendes.
    index('contracts_vehicle_period_idx').on(
      table.orgId,
      table.vehicleId,
      table.plannedStartAt,
      table.plannedEndAt,
    ),
    // « Finit aujourd'hui », « en retard ».
    index('contracts_status_end_idx').on(table.orgId, table.status, table.plannedEndAt),
    index('contracts_customer_idx').on(table.orgId, table.customerId),
  ],
)

export const contractPayments = pgTable(
  'contract_payments',
  {
    ...orgColumns,
    contractId: text('contract_id').notNull(),
    amountCents: cents('amount_cents').notNull(),
    currency: text('currency').notNull().default('MAD'),
    /** cash | cheque | card | transfer */
    method: text('method').notNull().default('cash'),
    receivedAt: timestamp('received_at').notNull(),
    note: text('note'),
  },
  (table) => [index('contract_payments_contract_idx').on(table.orgId, table.contractId)],
)

/** État des lieux, au départ et au retour. */
export const conditionReports = pgTable(
  'condition_reports',
  {
    ...orgColumns,
    contractId: text('contract_id').notNull(),
    /** pickup | return */
    phase: text('phase').notNull(),
    /** Points de dommage sur le schéma de carrosserie, sérialisés puis validés par Zod. */
    bodyDamageJson: text('body_damage_json'),
    fuelEighths: integer('fuel_eighths'),
    km: integer('km'),
    /** clean | acceptable | dirty */
    cleanliness: text('cleanliness'),
    notes: text('notes'),
    signedAt: timestamp('signed_at'),
    signaturePath: text('signature_path'),
  },
  (table) => [
    uniqueIndex('condition_reports_unique')
      .on(table.orgId, table.contractId, table.phase)
      .where(aliveOnly),
  ],
)

export const conditionPhotos = pgTable(
  'condition_photos',
  {
    ...orgColumns,
    conditionReportId: text('condition_report_id').notNull(),
    path: text('path').notNull(),
    zone: text('zone'),
  },
  (table) => [index('condition_photos_report_idx').on(table.orgId, table.conditionReportId)],
)
