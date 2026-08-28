import { index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

import { aliveOnly, bool, cents, civilDate, orgColumns } from './_shared'

/**
 * Documents administratifs du véhicule.
 *
 * Deux écarts au cahier des charges sont matérialisés ici, et ils sont volontaires :
 *  - É1 : `registration_docs` (carte grise) n'a PAS de date d'expiration. Au Maroc
 *    c'est un document permanent ; lui inventer une échéance ferait rire un loueur.
 *  - É3 : `road_taxes` (vignette) est indexée sur l'ANNÉE CIVILE, pas sur une date
 *    d'expiration glissante. La TSAVA est due chaque année dans une fenêtre de début
 *    d'année : c'est une campagne, pas une échéance individuelle.
 */

export const insurancePolicies = pgTable(
  'insurance_policies',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    company: text('company').notNull(),
    policyNumber: text('policy_number'),
    startsOn: civilDate('starts_on'),
    expiresOn: civilDate('expires_on').notNull(),
    premiumCents: cents('premium_cents'),
    /** tous_risques | tiers | tiers_plus */
    coverage: text('coverage'),
    scanPath: text('scan_path'),
    /** Une seule police courante par véhicule ; les précédentes restent en historique. */
    isCurrent: bool('is_current').notNull().default(true),
  },
  (table) => [
    index('insurance_expiry_idx').on(table.orgId, table.isCurrent, table.expiresOn),
    index('insurance_vehicle_idx').on(table.orgId, table.vehicleId),
  ],
)

export const technicalInspections = pgTable(
  'technical_inspections',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    centerName: text('center_name'),
    certificateNumber: text('certificate_number'),
    performedOn: civilDate('performed_on').notNull(),
    /**
     * Échéance. Intervalle par défaut : 12 mois pour un véhicule de location (É4),
     * paramétrable par organisation et par véhicule, jamais codé en dur.
     * @needs-confirmation — règle réglementaire à confirmer auprès de la NARSA.
     */
    expiresOn: civilDate('expires_on').notNull(),
    /** pass | fail | pass_with_defects */
    result: text('result').notNull().default('pass'),
    costCents: cents('cost_cents'),
    scanPath: text('scan_path'),
    isCurrent: bool('is_current').notNull().default(true),
  },
  (table) => [
    index('inspection_expiry_idx').on(table.orgId, table.isCurrent, table.expiresOn),
    index('inspection_vehicle_idx').on(table.orgId, table.vehicleId),
  ],
)

/** Vignette (TSAVA) — une ligne par véhicule et par année civile. Voir É3. */
export const roadTaxes = pgTable(
  'road_taxes',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    year: integer('year').notNull(),
    paidAt: civilDate('paid_at'),
    amountCents: cents('amount_cents'),
    receiptNumber: text('receipt_number'),
    receiptPath: text('receipt_path'),
  },
  (table) => [
    uniqueIndex('road_taxes_unique').on(table.orgId, table.vehicleId, table.year).where(aliveOnly),
    index('road_taxes_year_idx').on(table.orgId, table.year, table.paidAt),
  ],
)

/** Carte grise — document PERMANENT au Maroc : pas d'`expires_on`, pas d'alerte. É1. */
export const registrationDocs = pgTable(
  'registration_docs',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    registrationNumber: text('registration_number'),
    firstRegisteredOn: civilDate('first_registered_on'),
    /** Date de mutation : la carte grise se mute, elle ne se renouvelle pas. */
    mutatedOn: civilDate('mutated_on'),
    isWw: bool('is_ww').notNull().default(false),
    scanPath: text('scan_path'),
  },
  (table) => [index('registration_vehicle_idx').on(table.orgId, table.vehicleId)],
)

/**
 * Ce qui expire vraiment côté administratif : l'agrément d'exploitation de l'agence
 * et, le cas échéant, la carte de transport. Leur expiration ferme l'agence — c'est
 * là que les alertes J-60/J-30/J-7 ont un sens, pas sur la carte grise.
 */
export const permits = pgTable(
  'permits',
  {
    ...orgColumns,
    branchId: text('branch_id'),
    vehicleId: text('vehicle_id'),
    /** operating_licence | transport_card | other */
    kind: text('kind').notNull(),
    authority: text('authority'),
    number: text('number'),
    issuedOn: civilDate('issued_on'),
    expiresOn: civilDate('expires_on').notNull(),
    costCents: cents('cost_cents'),
    scanPath: text('scan_path'),
    isCurrent: bool('is_current').notNull().default(true),
  },
  (table) => [index('permits_expiry_idx').on(table.orgId, table.isCurrent, table.expiresOn)],
)
