import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { aliveOnly, bool, civilDate, orgColumns, timestamp } from './_shared'
import { integer } from 'drizzle-orm/sqlite-core'

/**
 * ALERTES — le cœur du produit.
 *
 * L'idempotence n'est PAS garantie par le code applicatif mais par l'index unique
 * ci-dessous : relancer le job dix fois échoue dix fois sur le conflit et ne crée
 * rien. C'est la seule garantie qui survit à une exécution concurrente.
 *
 * `periodKey` est l'écart É5 du cahier des charges, et c'est un correctif : sans
 * lui, une alerte « assurance J-30 » résolue ne pourrait plus jamais être réémise,
 * y compris l'année suivante après renouvellement de la police. La démo tournerait,
 * la deuxième année de production serait silencieuse.
 */
export const alerts = sqliteTable(
  'alerts',
  {
    ...orgColumns,
    /** vehicle | contract | customer | branch | organization */
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    /** ex. `insurance.expiry`, `maintenance.due`, `contract.late` */
    alertType: text('alert_type').notNull(),
    /** ex. `d-30`, `d-0`, `overdue`, `km-500` */
    thresholdKey: text('threshold_key').notNull(),
    /** Date d'échéance concernée (`2027-03-14`) ou année (`2027`). Voir É5. */
    periodKey: text('period_key').notNull(),

    /** low | medium | high | critical | blocking */
    severity: text('severity').notNull(),
    dueOn: civilDate('due_on'),
    dueAt: timestamp('due_at'),

    /** open | snoozed | acknowledged | resolved */
    state: text('state').notNull().default('open'),
    snoozedUntilAt: timestamp('snoozed_until_at'),
    acknowledgedBy: text('acknowledged_by'),
    resolvedAt: timestamp('resolved_at'),

    /** De quoi afficher la ligne sans re-requêter l'entité. */
    payloadJson: text('payload_json'),
    firstSeenAt: timestamp('first_seen_at').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull(),
  },
  (table) => [
    uniqueIndex('alerts_identity_unique')
      .on(
        table.orgId,
        table.entityType,
        table.entityId,
        table.alertType,
        table.thresholdKey,
        table.periodKey,
      )
      .where(aliveOnly),
    index('alerts_inbox_idx').on(table.orgId, table.state, table.severity, table.dueOn),
    index('alerts_entity_idx').on(table.orgId, table.entityType, table.entityId),
  ],
)

export const notifications = sqliteTable(
  'notifications',
  {
    ...orgColumns,
    alertId: text('alert_id'),
    /** email | push | sms | whatsapp | inapp */
    channel: text('channel').notNull(),
    recipient: text('recipient').notNull(),
    subject: text('subject'),
    body: text('body'),
    locale: text('locale').notNull().default('fr'),
    /**
     * queued | sent | failed | skipped_demo.
     * `skipped_demo` est le verrou dur du mode démonstration : la notification est
     * ENREGISTRÉE, pour que la démo montre le comportement, mais jamais ENVOYÉE.
     */
    state: text('state').notNull().default('queued'),
    sentAt: timestamp('sent_at'),
    error: text('error'),
    providerMessageId: text('provider_message_id'),
  },
  (table) => [
    index('notifications_state_idx').on(table.orgId, table.state, table.createdAt),
    index('notifications_alert_idx').on(table.orgId, table.alertId),
  ],
)

export const alertSettings = sqliteTable(
  'alert_settings',
  {
    ...orgColumns,
    alertType: text('alert_type').notNull(),
    /** Seuils propres à l'organisation, sérialisés puis validés par Zod. */
    thresholdsJson: text('thresholds_json'),
    channelsJson: text('channels_json'),
    isEnabled: bool('is_enabled').notNull().default(true),
    /**
     * Heure LOCALE (Africa/Casablanca) du digest quotidien. Le job décide lui-même
     * s'il est cette heure-là : jamais d'offset fixe, le Maroc bascule à UTC+0
     * pendant le Ramadan (docs/DECISIONS.md É7).
     */
    digestHourLocal: integer('digest_hour_local').notNull().default(8),
  },
  (table) => [uniqueIndex('alert_settings_unique').on(table.orgId, table.alertType)],
)
