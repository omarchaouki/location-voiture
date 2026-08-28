import { relations } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { bool } from './_shared'

/**
 * TABLES D'AUTHENTIFICATION — contrat Better Auth, pas notre charte.
 *
 * Ces sept tables ne nous appartiennent pas : leur forme est imposée par Better Auth
 * 1.7.1 et par ses plugins `organization` et `admin`. Elle a été relevée en
 * interrogeant `getSchema()` du paquet installé (script d'introspection, Phase 2),
 * pas en recopiant une page de documentation.
 *
 * **Exception assumée à la règle 2 de la charte de portabilité** : ici les dates sont
 * de vrais horodatages et non des `text` ISO, parce que l'adaptateur Drizzle de Better
 * Auth passe des objets `Date` à Drizzle — le code qui les lit n'est pas le nôtre.
 * La règle reste entière pour toutes les tables métier, que nous écrivons nous-mêmes.
 * Voir docs/DECISIONS.md §11.
 *
 * En SQLite c'était un `integer` epoch, faute de type dédié. Postgres a `timestamptz`,
 * et `withTimezone` est **obligatoire** ici : ce n'est pas cosmétique. Une session dont
 * l'expiration serait stockée sans fuseau expirerait à contretemps deux fois par an, et
 * le Maroc bascule aussi pendant le Ramadan (docs/DECISIONS.md É7).
 *
 * Les noms de tables sont au pluriel : l'adaptateur est configuré avec
 * `usePlural: true`, qui fait la correspondance `user` → `users` tout seul.
 */

const authDate = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: bool('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: authDate('created_at').notNull(),
    updatedAt: authDate('updated_at').notNull(),

    /** Rôle PLATEFORME (plugin `admin`) : `platform_owner`, ou nul. */
    role: text('role'),
    banned: bool('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: authDate('ban_expires'),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: authDate('expires_at').notNull(),
    token: text('token').notNull(),
    createdAt: authDate('created_at').notNull(),
    updatedAt: authDate('updated_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /**
     * LA source du `orgId` côté serveur. Jamais un paramètre d'URL, jamais un
     * en-tête envoyé par le client. Voir src/db/tenant.ts.
     */
    activeOrganizationId: text('active_organization_id'),

    /** Rempli pendant une impersonation : l'identifiant de l'administrateur. */
    impersonatedBy: text('impersonated_by'),
  },
  (table) => [
    uniqueIndex('sessions_token_unique').on(table.token),
    index('sessions_user_idx').on(table.userId),
  ],
)

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: authDate('access_token_expires_at'),
    refreshTokenExpiresAt: authDate('refresh_token_expires_at'),
    scope: text('scope'),
    /** Haché par Better Auth (scrypt). Jamais en clair, jamais lu par notre code. */
    password: text('password'),
    createdAt: authDate('created_at').notNull(),
    updatedAt: authDate('updated_at').notNull(),
  },
  (table) => [index('accounts_user_idx').on(table.userId)],
)

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: authDate('expires_at').notNull(),
    createdAt: authDate('created_at').notNull(),
    updatedAt: authDate('updated_at').notNull(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
)

/**
 * L'ORGANISATION — le locataire.
 *
 * Table Better Auth (plugin `organization`) ÉTENDUE par nos champs métier, déclarés
 * côté Better Auth en `additionalFields`. C'est l'écart É2 du cahier des charges :
 * on ne réécrit pas orgs, membres et invitations, on les habille.
 */
export const organizations = pgTable(
  'organizations',
  {
    // --- champs Better Auth ---
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logo: text('logo'),
    createdAt: authDate('created_at').notNull(),
    metadata: text('metadata'),

    // --- nos champs métier (additionalFields) ---
    planCode: text('plan_code').notNull().default('trial'),
    /** trialing | active | past_due | suspended | read_only | cancelled */
    status: text('status').notNull().default('trialing'),
    isDemo: bool('is_demo').notNull().default(false),
    trialEndsAt: authDate('trial_ends_at'),
    city: text('city'),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    /** fr | ar | en */
    localeDefault: text('locale_default').notNull().default('fr'),
    timezone: text('timezone').notNull().default('Africa/Casablanca'),
    /** Visible dans /admin uniquement. Jamais renvoyé à un client. */
    internalNote: text('internal_note'),
    /** Soft delete, comme partout ailleurs. */
    deletedAt: authDate('deleted_at'),
  },
  (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)],
)

export const members = pgTable(
  'members',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** owner | manager | agent | mechanic | viewer — rôles INTERNES à l'organisation. */
    role: text('role').notNull().default('viewer'),
    createdAt: authDate('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('members_org_user_unique').on(table.organizationId, table.userId),
    index('members_user_idx').on(table.userId),
  ],
)

export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    /** pending | accepted | rejected | canceled */
    status: text('status').notNull().default('pending'),
    expiresAt: authDate('expires_at').notNull(),
    createdAt: authDate('created_at').notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('invitations_org_idx').on(table.organizationId, table.status),
    index('invitations_email_idx').on(table.email, table.status),
  ],
)

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Relations déclarées pour l'API relationnelle de Drizzle.
 *
 * Elles n'existent que pour une raison : `advanced.database.joins` de Better Auth,
 * qui annonce un `/get-session` deux à trois fois plus rapide en remplaçant plusieurs
 * requêtes par une jointure. Sans ces déclarations, l'option échoue sur une erreur
 * opaque — « Cannot read properties of undefined (reading 'referencedTable') » —
 * rencontrée telle quelle en Phase 2 (docs/DECISIONS.md §11.3).
 *
 * Les clés étrangères sont déjà déclarées colonne par colonne ci-dessus ; ceci n'est
 * que leur reflet dans l'API relationnelle. Aucune table métier n'en a besoin : nos
 * repositories lisent table par table, volontairement.
 */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  members: many(members),
  invitations: many(invitations),
}))

/*
 * Les noms de relations sont ceux des TABLES, au pluriel — `users` et non `user`.
 *
 * Ce n'est pas un choix de style : l'adaptateur de Better Auth construit sa clause
 * `with` à partir du nom de modèle après application de `usePlural`. Journalisé sur
 * l'appel réel : `findFirst sur sessions avec {"users":true}`. Une relation nommée
 * `user` produit l'erreur opaque « Cannot read properties of undefined (reading
 * 'referencedTable') » — celle qui avait fait renoncer en Phase 2.
 */
export const sessionsRelations = relations(sessions, ({ one }) => ({
  users: one(users, { fields: [sessions.userId], references: [users.id] }),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  users: one(users, { fields: [accounts.userId], references: [users.id] }),
}))

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(invitations),
}))

export const membersRelations = relations(members, ({ one }) => ({
  organizations: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
  users: one(users, { fields: [members.userId], references: [users.id] }),
}))

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organizations: one(organizations, {
    fields: [invitations.organizationId],
    references: [organizations.id],
  }),
  users: one(users, { fields: [invitations.inviterId], references: [users.id] }),
}))
