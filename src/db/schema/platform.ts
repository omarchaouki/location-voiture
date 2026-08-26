import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { bool, civilDate, orgColumns, platformColumns } from './_shared'

/**
 * Tables de plateforme qui nous appartiennent : agences, journal d'audit, prospects,
 * drapeaux. Elles suivent la charte (dates en `text` ISO).
 *
 * L'organisation elle-même vit dans `auth.ts` : c'est une table Better Auth étendue,
 * pas une table à nous. Voir docs/DECISIONS.md É2 et §11.
 */

/** Agence. Une organisation en a de 1 à 5 dans le cas visé. */
export const branches = sqliteTable(
  'branches',
  {
    ...orgColumns,
    name: text('name').notNull(),
    city: text('city'),
    address: text('address'),
    phone: text('phone'),
    lat: text('lat'),
    lng: text('lng'),
    isDefault: bool('is_default').notNull().default(false),
    openingHours: text('opening_hours_json'),
  },
  (table) => [index('branches_org_idx').on(table.orgId, table.deletedAt)],
)

/**
 * Journal d'audit : contrats, cautions, prix, suppressions, changements de plan,
 * impersonation. `orgId` est nullable parce qu'un acte de plateforme (création
 * d'organisation, changement de plan depuis /admin) n'appartient à aucun client.
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    ...platformColumns,
    orgId: text('org_id'),
    actorUserId: text('actor_user_id'),
    /** Organisation consultée pendant une impersonation. */
    actingAsOrgId: text('acting_as_org_id'),
    impersonated: bool('impersonated').notNull().default(false),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    /** Haché : on trace sans conserver d'adresse IP en clair. */
    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),
  },
  (table) => [
    index('audit_log_org_idx').on(table.orgId, table.createdAt),
    index('audit_log_actor_idx').on(table.actorUserId, table.createdAt),
  ],
)

/** Demandes de démo venues du site vitrine. */
export const leads = sqliteTable(
  'leads',
  {
    ...platformColumns,
    name: text('name').notNull(),
    company: text('company'),
    phone: text('phone').notNull(),
    email: text('email'),
    fleetSize: text('fleet_size'),
    city: text('city'),
    message: text('message'),
    source: text('source'),
    locale: text('locale').notNull().default('fr'),
    /** new | contacted | converted | rejected */
    status: text('status').notNull().default('new'),
    convertedOrgId: text('converted_org_id'),
    contactedOn: civilDate('contacted_on'),
    ipHash: text('ip_hash'),
  },
  (table) => [index('leads_status_idx').on(table.status, table.createdAt)],
)

/** Interrupteurs de fonctionnalité, globaux ou par organisation. */
export const featureFlags = sqliteTable(
  'feature_flags',
  {
    ...platformColumns,
    key: text('key').notNull(),
    /** global | org */
    scope: text('scope').notNull().default('global'),
    orgId: text('org_id'),
    enabled: bool('enabled').notNull().default(false),
    note: text('note'),
  },
  (table) => [uniqueIndex('feature_flags_key_scope_unique').on(table.key, table.orgId)],
)

/**
 * Sessions d'impersonation — la fonctionnalité la plus dangereuse du produit.
 *
 * Better Auth crée déjà la session d'impersonation et la fait expirer à 30 minutes
 * (`session.impersonatedBy`). Ce qu'il ne sait pas, c'est notre POLITIQUE :
 * l'écriture est interdite par défaut et demande une élévation explicite.
 * C'est cette table qui la porte, et c'est elle que lit `TenantContext.canWrite`.
 */
export const impersonationSessions = sqliteTable(
  'impersonation_sessions',
  {
    ...platformColumns,
    /** Session Better Auth ouverte au nom du client. */
    sessionId: text('session_id').notNull(),
    adminUserId: text('admin_user_id').notNull(),
    targetUserId: text('target_user_id').notNull(),
    orgId: text('org_id').notNull(),
    /** Faux par défaut : consultation seule tant qu'on n'a pas élevé explicitement. */
    writeEnabled: bool('write_enabled').notNull().default(false),
    writeEnabledAt: text('write_enabled_at'),
    reason: text('reason'),
    expiresAt: text('expires_at').notNull(),
    endedAt: text('ended_at'),
  },
  (table) => [
    uniqueIndex('impersonation_sessions_session_unique').on(table.sessionId),
    index('impersonation_admin_idx').on(table.adminUserId, table.createdAt),
  ],
)
