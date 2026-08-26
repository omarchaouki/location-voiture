import { and, eq, isNull } from 'drizzle-orm'

import { getDb, type Db } from '~/db/client'
import { members, organizations, sessions, users } from '~/db/schema/auth'
import { impersonationSessions } from '~/db/schema/platform'
import type { TenantContext } from '~/db/tenant'
import { getAuth, type Auth } from './server'
import { isOrgRole, PLATFORM_OWNER, READ_ONLY_ROLES, type OrgRole } from './permissions'
/*
 * `ForbiddenError` et `requireRole` sont définis à part, dans un module qui n'ouvre
 * PAS la base : une server function qui n'a besoin que d'eux ne doit pas traîner
 * `better-sqlite3` dans le paquet client. Réexportés ici pour que les appelants
 * existants n'aient rien à changer. Voir src/auth/guards.ts.
 */
export { ForbiddenError, requireRole } from './guards'
import { ForbiddenError } from './guards'

/**
 * L'INTERFACE `AuthProvider` du cahier des charges §3.
 *
 * Le reste du code ne parle jamais à Better Auth : il appelle `requireTenant()`,
 * `requireRole()` ou `requirePlatformOwner()`. Le jour où l'authentification change
 * (Supabase Auth en Phase 12), c'est ce fichier qui bouge, et lui seul.
 *
 * Règle qui ne se négocie pas : le `orgId` vient de `session.activeOrganizationId`,
 * donc du serveur. Jamais d'un paramètre d'URL, d'un champ de formulaire ou d'un
 * en-tête envoyé par le client.
 */

export class UnauthenticatedError extends Error {
  constructor() {
    super('not authenticated')
    this.name = 'UnauthenticatedError'
  }
}

export interface SessionInfo {
  userId: string
  email: string
  name: string
  /** Rôle PLATEFORME (`platform_owner`) ou nul. Jamais un rôle d'organisation. */
  platformRole: string | null
  sessionId: string
  activeOrganizationId: string | null
  impersonatedBy: string | null
}

/** Organisations dont le statut interdit toute écriture métier. */
const FROZEN_STATUSES: ReadonlySet<string> = new Set([
  'read_only',
  'suspended',
  'past_due',
  'cancelled',
])

export async function getSession(
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<SessionInfo | null> {
  const result = await auth.api.getSession({ headers })
  if (!result) return null

  return {
    userId: result.user.id,
    email: result.user.email,
    name: result.user.name,
    platformRole: (result.user as { role?: string | null }).role ?? null,
    sessionId: result.session.id,
    activeOrganizationId: result.session.activeOrganizationId ?? null,
    impersonatedBy: (result.session as { impersonatedBy?: string | null }).impersonatedBy ?? null,
  }
}

export async function requireSession(
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<SessionInfo> {
  const session = await getSession(headers, auth)
  if (!session) throw new UnauthenticatedError()
  return session
}

/**
 * Le super administrateur. Rôle plateforme, jamais un rôle d'organisation.
 * Une session en impersonation N'EST PAS une session d'administrateur : elle est
 * refusée ici, sinon l'impersonation deviendrait une élévation de privilèges.
 */
export async function requirePlatformOwner(
  headers: Headers,
  auth: Auth = getAuth(),
): Promise<SessionInfo> {
  const session = await requireSession(headers, auth)
  if (session.impersonatedBy !== null) throw new ForbiddenError('impersonating')
  if (session.platformRole !== PLATFORM_OWNER) throw new ForbiddenError('not platform owner')
  return session
}

/**
 * Construit le contexte de locataire à partir de la session.
 *
 * Trois vérifications distinctes, comme l'exige le cahier des charges §15 :
 * appartenance à l'organisation, rôle, et état de l'abonnement.
 */
export async function requireTenant(
  headers: Headers,
  options: { db?: Db; auth?: Auth } = {},
): Promise<TenantContext> {
  const db = options.db ?? getDb()
  const auth = options.auth ?? getAuth()
  const session = await requireSession(headers, auth)

  const orgId = session.activeOrganizationId ?? (await adoptSoleOrganization(db, session))
  if (!orgId) throw new ForbiddenError('no active organization')

  // 1. Appartenance : l'utilisateur est-il membre de CETTE organisation ?
  const membership = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, orgId), eq(members.userId, session.userId)))
    .limit(1)

  const rawRole = membership[0]?.role
  if (rawRole === undefined) throw new ForbiddenError('not a member')
  if (!isOrgRole(rawRole)) throw new ForbiddenError('unknown role')
  const role: OrgRole = rawRole

  // 2. État de l'organisation : existe-t-elle encore, est-elle gelée, est-ce une démo ?
  const org = await db
    .select({
      status: organizations.status,
      isDemo: organizations.isDemo,
      planCode: organizations.planCode,
    })
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
    .limit(1)

  const organization = org[0]
  if (!organization) throw new ForbiddenError('organization unavailable')

  // 3. Impersonation : lecture seule par défaut, écriture sur élévation explicite.
  const impersonated = session.impersonatedBy !== null
  let impersonationWrite = false
  if (impersonated) {
    const grant = await db
      .select({ writeEnabled: impersonationSessions.writeEnabled })
      .from(impersonationSessions)
      .where(
        and(
          eq(impersonationSessions.sessionId, session.sessionId),
          isNull(impersonationSessions.endedAt),
        ),
      )
      .limit(1)
    impersonationWrite = grant[0]?.writeEnabled === true
  }

  const frozen = FROZEN_STATUSES.has(organization.status)
  const canWrite =
    !frozen && !READ_ONLY_ROLES.has(role) && (impersonated ? impersonationWrite : true)

  return {
    orgId,
    userId: session.userId,
    role,
    planCode: organization.planCode,
    impersonated,
    canWrite,
    isDemo: organization.isDemo,
  }
}

/**
 * Un membre d'UNE SEULE organisation y entre directement.
 *
 * `activeOrganizationId` n'est posé que lors de l'acceptation d'une invitation ; une
 * connexion ultérieure ouvre une session neuve, sans organisation active. Sans cette
 * adoption, tout utilisateur qui revient le lendemain voit « aucune organisation » —
 * défaut constaté à l'écran, pas en test.
 *
 * TODO (Phase 5) : quand une même personne appartiendra à plusieurs organisations
 * (groupe multi-agences), il faudra un sélecteur. On ne devine pas à sa place :
 * tant qu'il y en a plusieurs, aucune n'est adoptée.
 */
async function adoptSoleOrganization(db: Db, session: SessionInfo): Promise<string | null> {
  const memberships = await db
    .select({ organizationId: members.organizationId })
    .from(members)
    .where(eq(members.userId, session.userId))
    .limit(2)

  if (memberships.length !== 1) return null
  const orgId = memberships[0]?.organizationId ?? null
  if (!orgId) return null

  // Persistée sur la session : la question ne se repose pas à chaque requête.
  await db
    .update(sessions)
    .set({ activeOrganizationId: orgId })
    .where(eq(sessions.id, session.sessionId))

  return orgId
}

/** Le nom affiché dans le bandeau d'impersonation. */
export async function describeActor(
  userId: string,
  db: Db = getDb(),
): Promise<{ name: string; email: string } | null> {
  const rows = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows[0] ?? null
}
