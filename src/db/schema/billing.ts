import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

import { bool, cents, civilDate, orgColumns, platformColumns, timestamp } from './_shared'

/**
 * Plans et quotas.
 *
 * Le front N'INTERROGE JAMAIS cette table pour décider : il affiche des libellés et
 * l'état de consommation. L'autorisation se décide côté serveur via `can(org, clé)`,
 * qui lit `plan_features`. Aucun `if (plan === 'pro')` n'est acceptable dans le code.
 */
export const plans = pgTable(
  'plans',
  {
    ...platformColumns,
    code: text('code').notNull(),
    nameKey: text('name_key').notNull(),
    monthlyCents: cents('monthly_cents').notNull().default(0),
    yearlyCents: cents('yearly_cents').notNull().default(0),
    currency: text('currency').notNull().default('MAD'),
    /** `null` = illimité. */
    maxVehicles: integer('max_vehicles'),
    maxUsers: integer('max_users'),
    maxBranches: integer('max_branches'),
    trialDays: integer('trial_days').notNull().default(0),
    isPublic: bool('is_public').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Références côté prestataire, jamais de prix codé en dur dans le front. */
    stripePriceIdMonthly: text('stripe_price_id_monthly'),
    stripePriceIdYearly: text('stripe_price_id_yearly'),
  },
  (table) => [uniqueIndex('plans_code_unique').on(table.code)],
)

export const planFeatures = pgTable(
  'plan_features',
  {
    ...platformColumns,
    planCode: text('plan_code').notNull(),
    /** ex. `gps.track`, `api.access`, `export.bulk` */
    featureKey: text('feature_key').notNull(),
    enabled: bool('enabled').notNull().default(false),
    limitValue: integer('limit_value'),
  },
  (table) => [uniqueIndex('plan_features_unique').on(table.planCode, table.featureKey)],
)

export const subscriptions = pgTable(
  'subscriptions',
  {
    ...orgColumns,
    planCode: text('plan_code').notNull(),
    /** trialing | active | past_due | cancelled | read_only */
    status: text('status').notNull(),
    /** manual | stripe | local_ma — l'application ne connaît jamais Stripe directement. */
    provider: text('provider').notNull().default('manual'),
    providerSubscriptionId: text('provider_subscription_id'),
    /** monthly | yearly */
    interval: text('interval').notNull().default('monthly'),
    periodStartAt: timestamp('period_start_at'),
    periodEndAt: timestamp('period_end_at'),
    cancelAtPeriodEnd: bool('cancel_at_period_end').notNull().default(false),
    /** Période de grâce après un impayé : 7 jours, puis lecture seule. */
    graceUntilAt: timestamp('grace_until_at'),
    trialEndsAt: timestamp('trial_ends_at'),
  },
  (table) => [index('subscriptions_org_idx').on(table.orgId, table.deletedAt)],
)

/**
 * Factures. `number` est une séquence CONTINUE, sans trou, attribuée en transaction
 * au passage `draft → sent` — c'est une obligation de facturation, pas une préférence.
 */
export const invoices = pgTable(
  'invoices',
  {
    ...orgColumns,
    number: text('number'),
    issuedOn: civilDate('issued_on'),
    dueOn: civilDate('due_on'),
    subtotalCents: cents('subtotal_cents').notNull().default(0),
    /** TVA en points de base : 2000 = 20 %. Entier, jamais 0.20. */
    vatRateBp: integer('vat_rate_bp').notNull().default(2000),
    vatCents: cents('vat_cents').notNull().default(0),
    totalCents: cents('total_cents').notNull().default(0),
    currency: text('currency').notNull().default('MAD'),
    /** draft | sent | paid | overdue | void */
    status: text('status').notNull().default('draft'),
    paidAt: timestamp('paid_at'),
    provider: text('provider'),
    providerInvoiceId: text('provider_invoice_id'),
    pdfPath: text('pdf_path'),
  },
  (table) => [
    uniqueIndex('invoices_number_unique').on(table.orgId, table.number),
    index('invoices_status_idx').on(table.orgId, table.status, table.dueOn),
  ],
)

/**
 * Événements de paiement reçus d'un prestataire.
 *
 * `(provider, event_id)` est UNIQUE : c'est cet index — et non le code applicatif —
 * qui garantit l'idempotence. Les webhooks arrivent en double et dans le désordre.
 */
export const paymentEvents = pgTable(
  'payment_events',
  {
    ...platformColumns,
    orgId: text('org_id'),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    payloadJson: text('payload_json'),
    receivedAt: timestamp('received_at').notNull(),
    processedAt: timestamp('processed_at'),
    /** ok | ignored | error — un événement inconnu est ignoré, pas rejeté. */
    result: text('result'),
    error: text('error'),
  },
  (table) => [uniqueIndex('payment_events_unique').on(table.provider, table.eventId)],
)

/** Consommation courante, recalculée côté serveur. Le front l'affiche, il n'en décide pas. */
export const usageCounters = pgTable(
  'usage_counters',
  {
    ...orgColumns,
    /** vehicles | users | branches */
    counterKey: text('counter_key').notNull(),
    value: integer('value').notNull().default(0),
    computedAt: timestamp('computed_at').notNull(),
  },
  (table) => [uniqueIndex('usage_counters_unique').on(table.orgId, table.counterKey)],
)

/**
 * DEMANDES DE CHANGEMENT D'OFFRE.
 *
 * Un client ne change pas d'offre tout seul, et ce n'est pas une limitation technique :
 * l'offre porte un prix, des quotas et une facturation. La laisser changer d'un clic
 * ferait passer une agence de 5 à 40 voitures sans qu'aucun contrat commercial ne le
 * couvre — et redescendre à 5 le lendemain avec 38 voitures en base, donc au-dessus du
 * quota, ce qui bloque tout jusqu'à ce qu'on en supprime 33.
 *
 * Le client DEMANDE, la plateforme DÉCIDE. La demande est une ligne, pas un e-mail :
 * elle a un état, un auteur, une date et une trace de la décision.
 *
 * `orgId` en fait une table cloisonnée : l'agence ne voit que ses propres demandes,
 * par le repository ordinaire. La plateforme les lit toutes depuis
 * `src/db/repositories/platform.ts`, le seul endroit autorisé à regarder toutes les
 * organisations à la fois.
 */
export const planChangeRequests = pgTable(
  'plan_change_requests',
  {
    ...orgColumns,
    /** L'offre au moment de la demande. Gardée pour que la décision reste lisible. */
    currentPlanCode: text('current_plan_code').notNull(),
    requestedPlanCode: text('requested_plan_code').notNull(),
    /** Le motif écrit par le client. C'est lui que le commercial lit en premier. */
    reason: text('reason'),
    /** pending | approved | refused | withdrawn */
    status: text('status').notNull().default('pending'),
    requestedBy: text('requested_by').notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at'),
    decisionNote: text('decision_note'),
  },
  (table) => [
    /*
     * UNE SEULE demande en attente par organisation, garantie par l'index et non par
     * le code : deux onglets ouverts, deux clics, et le back-office recevrait deux
     * demandes contradictoires de la même agence.
     */
    uniqueIndex('plan_change_pending_unique')
      .on(table.orgId)
      .where(sql`status = 'pending' and deleted_at is null`),
    index('plan_change_status_idx').on(table.status, table.createdAt),
  ],
)
