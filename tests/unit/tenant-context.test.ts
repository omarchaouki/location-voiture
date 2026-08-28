import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { ForbiddenError, requirePlatformOwner, requireRole, requireTenant } from '~/auth/context'
import type { OrgRole } from '~/auth/permissions'
import type { Auth } from '~/auth/server'
import type { Db } from '~/db/client'
import { organizations, sessions } from '~/db/schema/auth'
import { impersonationSessions } from '~/db/schema/platform'
import { createTestDb } from '../helpers/db'
import {
  bootstrapAdmin,
  captureNotifications,
  createTestAuth,
  headersFrom,
  signUp,
} from '../helpers/auth'
import type { SignedInUser } from '../helpers/auth'

/**
 * La chaîne complète du cloisonnement : session → `activeOrganizationId` → rôle →
 * `TenantContext`.
 *
 * En Phase 1, le `TenantContext` était fabriqué à la main par les tests. Ici il vient
 * d'une VRAIE session Better Auth : c'est ce chemin-là qui porte la sécurité en
 * production, donc c'est celui qu'il faut prouver.
 */

let db: Db
let auth: Auth

beforeEach(async () => {
  db = await createTestDb()
  auth = createTestAuth(db)
  captureNotifications()
})

async function admin(): Promise<SignedInUser> {
  return bootstrapAdmin(db, auth, {
    email: 'admin@registre.ma',
    password: 'mot-de-passe-tres-long',
    name: 'Super administrateur',
  })
}

async function makeOrg(headers: Headers, name: string, slug: string) {
  const org = await auth.api.createOrganization({
    body: { name, slug, localeDefault: 'fr' },
    headers,
  })
  if (!org) throw new Error('organisation non créée')
  return org
}

/** Invite, inscrit, accepte, active — le parcours réel d'un nouveau membre. */
async function joinOrg(
  adminUser: SignedInUser,
  orgId: string,
  email: string,
  role: OrgRole,
): Promise<SignedInUser> {
  const invitation = await auth.api.createInvitation({
    body: { email, role, organizationId: orgId },
    headers: adminUser.headers,
  })

  const member = await signUp(auth, {
    email,
    password: 'mot-de-passe-tres-long',
    name: email,
  })

  await auth.api.acceptInvitation({
    body: { invitationId: invitation.id },
    headers: member.headers,
  })
  await auth.api.setActiveOrganization({
    body: { organizationId: orgId },
    headers: member.headers,
  })

  return member
}

describe('requireTenant', () => {
  it('construit le contexte depuis la session, jamais depuis l’appelant', async () => {
    const adminUser = await admin()
    const org = await makeOrg(adminUser.headers, 'Atlas Cars', 'atlas-cars')
    const owner = await joinOrg(adminUser, org.id, 'owner@atlas.ma', 'owner')

    const ctx = await requireTenant(owner.headers, { db, auth })

    expect(ctx.orgId).toBe(org.id)
    expect(ctx.userId).toBe(owner.userId)
    expect(ctx.role).toBe('owner')
    expect(ctx.canWrite).toBe(true)
    expect(ctx.impersonated).toBe(false)
    expect(ctx.isDemo).toBe(false)
  })

  it('refuse une session sans organisation active', async () => {
    const adminUser = await admin()
    const org = await makeOrg(adminUser.headers, 'Atlas Cars', 'atlas-cars')

    // Invité, inscrit, mais l'invitation n'est pas encore acceptée.
    await auth.api.createInvitation({
      body: { email: 'nouveau@atlas.ma', role: 'agent', organizationId: org.id },
      headers: adminUser.headers,
    })
    const user = await signUp(auth, {
      email: 'nouveau@atlas.ma',
      password: 'mot-de-passe-tres-long',
      name: 'Nouveau',
    })

    await expect(requireTenant(user.headers, { db, auth })).rejects.toBeInstanceOf(ForbiddenError)
  })

  /**
   * Défense en profondeur : même si une session portait l'identifiant d'une autre
   * organisation — session périmée, base trafiquée, bug ailleurs — l'appartenance est
   * revérifiée à chaque appel.
   */
  it('refuse une organisation active dont l’utilisateur n’est PAS membre', async () => {
    const adminUser = await admin()
    const atlas = await makeOrg(adminUser.headers, 'Atlas Cars', 'atlas-cars')
    const sahara = await makeOrg(adminUser.headers, 'Sahara Rent', 'sahara-rent')
    const owner = await joinOrg(adminUser, atlas.id, 'owner@atlas.ma', 'owner')

    // On force la session à pointer sur l'organisation du voisin.
    await db
      .update(sessions)
      .set({ activeOrganizationId: sahara.id })
      .where(eq(sessions.userId, owner.userId))

    await expect(requireTenant(owner.headers, { db, auth })).rejects.toThrow(/not a member/)
  })

  it('un `viewer` ne peut pas écrire', async () => {
    const adminUser = await admin()
    const org = await makeOrg(adminUser.headers, 'Atlas Cars', 'atlas-cars')
    const viewer = await joinOrg(adminUser, org.id, 'comptable@atlas.ma', 'viewer')

    const ctx = await requireTenant(viewer.headers, { db, auth })
    expect(ctx.role).toBe('viewer')
    expect(ctx.canWrite).toBe(false)
  })

  it('une organisation en lecture seule gèle l’écriture, sans rien supprimer', async () => {
    const adminUser = await admin()
    const org = await makeOrg(adminUser.headers, 'Atlas Cars', 'atlas-cars')
    const owner = await joinOrg(adminUser, org.id, 'owner@atlas.ma', 'owner')

    await db.update(organizations).set({ status: 'read_only' }).where(eq(organizations.id, org.id))

    const ctx = await requireTenant(owner.headers, { db, auth })
    // La lecture reste possible : c'est tout l'intérêt de la lecture seule.
    expect(ctx.orgId).toBe(org.id)
    expect(ctx.canWrite).toBe(false)
  })

  it('une organisation supprimée devient inaccessible', async () => {
    const adminUser = await admin()
    const org = await makeOrg(adminUser.headers, 'Atlas Cars', 'atlas-cars')
    const owner = await joinOrg(adminUser, org.id, 'owner@atlas.ma', 'owner')

    await db.update(organizations).set({ deletedAt: new Date() }).where(eq(organizations.id, org.id))

    await expect(requireTenant(owner.headers, { db, auth })).rejects.toThrow(
      /organization unavailable/,
    )
  })
})

describe('requireRole', () => {
  it('laisse passer un rôle autorisé et refuse les autres', async () => {
    const adminUser = await admin()
    const org = await makeOrg(adminUser.headers, 'Atlas Cars', 'atlas-cars')
    const agent = await joinOrg(adminUser, org.id, 'agent@atlas.ma', 'agent')

    const ctx = await requireTenant(agent.headers, { db, auth })
    expect(() => requireRole(ctx, 'owner', 'manager', 'agent')).not.toThrow()
    expect(() => requireRole(ctx, 'owner')).toThrow(ForbiddenError)
  })
})

describe('impersonation', () => {
  async function impersonate() {
    const adminUser = await admin()
    const org = await makeOrg(adminUser.headers, 'Atlas Cars', 'atlas-cars')
    const owner = await joinOrg(adminUser, org.id, 'owner@atlas.ma', 'owner')

    const response = await auth.api.impersonateUser({
      body: { userId: owner.userId },
      headers: adminUser.headers,
      asResponse: true,
    })
    // Tous les `set-cookie`, pas seulement le premier — voir headersFrom().
    const headers = headersFrom(response)

    await auth.api.setActiveOrganization({ body: { organizationId: org.id }, headers })
    return { adminUser, org, owner, headers }
  }

  it('est en LECTURE SEULE par défaut', async () => {
    const { headers, org } = await impersonate()

    const ctx = await requireTenant(headers, { db, auth })
    expect(ctx.orgId).toBe(org.id)
    expect(ctx.impersonated).toBe(true)
    // Le point le plus important du produit : consulter, oui ; écrire, non.
    expect(ctx.canWrite).toBe(false)
  })

  it('écrit seulement après une élévation explicite', async () => {
    const { headers, adminUser, owner, org } = await impersonate()
    const before = await requireTenant(headers, { db, auth })
    expect(before.canWrite).toBe(false)

    const session = await auth.api.getSession({ headers })
    await db.insert(impersonationSessions).values({
      sessionId: session?.session.id ?? '',
      adminUserId: adminUser.userId,
      targetUserId: owner.userId,
      orgId: org.id,
      writeEnabled: true,
      writeEnabledAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    const after = await requireTenant(headers, { db, auth })
    expect(after.canWrite).toBe(true)
  })

  /** Sinon l'impersonation deviendrait une élévation de privilèges. */
  it('une session en impersonation n’est PAS une session d’administrateur', async () => {
    const { headers } = await impersonate()

    await expect(requirePlatformOwner(headers, auth)).rejects.toThrow(/impersonating/)
  })
})
