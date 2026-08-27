import { createServerFn } from '@tanstack/react-start'
import { getRequest, getRequestIP, setResponseHeader } from '@tanstack/react-start/server'
import { and, count, desc, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { requirePlatformOwner } from '~/auth/context'
import { getAuth } from '~/auth/server'
import { getDb } from '~/db/client'
import { invitations, members, organizations, users } from '~/db/schema/auth'
import { impersonationSessions } from '~/db/schema/platform'
import { platformMetrics, type PlatformMetrics } from '~/db/repositories/platform'
import { audit } from './audit'
import { cookieHeaderFrom } from './cookies'

/**
 * Back-office — les actes de plateforme.
 *
 * Chaque fonction commence par `requirePlatformOwner`, qui refuse aussi une session
 * en impersonation : sinon l'impersonation deviendrait une élévation de privilèges.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const CreateOrganizationInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(60).regex(SLUG),
  city: z.string().trim().max(80).optional(),
  planCode: z.enum(['trial', 'starter', 'pro', 'business']),
  localeDefault: z.enum(['fr', 'ar', 'en']),
  ownerEmail: z.email(),
})

export interface AdminOrganization {
  id: string
  name: string
  slug: string
  city: string | null
  planCode: string
  status: string
  isDemo: boolean
  memberCount: number
  ownerUserId: string | null
  /**
   * Adresse de l'invitation de propriétaire encore EN COURS, s'il y en a une.
   *
   * Elle existe pour sortir d'un cul-de-sac signalé le 27/08/2026 : une agence dont
   * personne n'a accepté l'invitation affichait « impossible de consulter cet
   * espace » et rien d'autre. Le constat était juste, mais il ne menait à aucune
   * action — or la seule chose à faire, relancer l'invitation, demande de savoir À
   * QUI elle a été envoyée.
   */
  pendingInviteEmail: string | null
  createdAt: string
}

export const listOrganizations = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AdminOrganization[]> => {
    const { headers } = getRequest()
    await requirePlatformOwner(headers)

    const db = getDb()

    /**
     * Jointure + regroupement plutôt qu'une sous-requête corrélée écrite à la main.
     *
     * La version en `sql\`(select count(*) …)\`` renvoyait 0 alors que la même requête
     * donnait 1 en SQL brut : la référence à la colonne externe n'était pas corrélée
     * comme attendu. Constaté en regardant l'écran afficher « 0 Membres » sur une
     * organisation qui en avait un. Au passage, on respecte la règle 6 de la charte :
     * pas de SQL brut hors migrations.
     */
    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        city: organizations.city,
        planCode: organizations.planCode,
        status: organizations.status,
        isDemo: organizations.isDemo,
        createdAt: organizations.createdAt,
        memberCount: count(members.id),
      })
      .from(organizations)
      .leftJoin(members, eq(members.organizationId, organizations.id))
      .where(isNull(organizations.deletedAt))
      .groupBy(organizations.id)
      .orderBy(desc(organizations.createdAt))

    // Les propriétaires en une seule requête : pas de N+1 dans la liste.
    const owners = await db
      .select({ organizationId: members.organizationId, userId: members.userId })
      .from(members)
      .where(eq(members.role, 'owner'))

    const ownerByOrg = new Map(owners.map((row) => [row.organizationId, row.userId]))

    /*
     * Les invitations de propriétaire encore en cours, en UNE requête.
     *
     * Même raison que pour les propriétaires juste au-dessus : une lecture par ligne
     * ferait un N+1 sur un écran qui affiche tout l'annuaire.
     */
    const pending = await db
      .select({ organizationId: invitations.organizationId, email: invitations.email })
      .from(invitations)
      .where(
        and(
          eq(invitations.role, 'owner'),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, new Date()),
        ),
      )

    const inviteByOrg = new Map(pending.map((row) => [row.organizationId, row.email]))

    return rows.map((row) => ({
      ...row,
      ownerUserId: ownerByOrg.get(row.id) ?? null,
      pendingInviteEmail: inviteByOrg.get(row.id) ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
  },
)

export const ResendInvitationInput = z.object({ organizationId: z.string().min(1) })

/**
 * RELANCER l'invitation du propriétaire.
 *
 * Sans elle, une agence dont l'invitation a expiré ou n'a jamais été ouverte était
 * définitivement bloquée depuis l'interface : plus de propriétaire à qui parler, donc
 * pas d'impersonation, et aucun moyen de renvoyer le lien.
 *
 * **La danse d'appartenance temporaire est obligatoire, et elle n'est pas jolie.**
 * Better Auth exige d'être membre de l'organisation pour y créer une invitation ; or
 * un propriétaire de plateforme n'est membre d'aucune organisation cliente, et c'est
 * la règle qui sépare la plateforme de ses clients (docs/DOMAIN.md §3.1). On entre
 * donc, on invite, et on ressort — exactement ce que fait déjà
 * `createOrganizationWithOwner`, où l'appartenance est posée par la création et
 * retirée juste après.
 *
 * `cancelPendingInvitationsOnReInvite` étant actif, la précédente invitation est
 * annulée : il n'existe jamais deux liens valides pour la même adresse.
 */
export const resendOwnerInvitation = createServerFn({ method: 'POST' })
  .validator(ResendInvitationInput)
  .handler(async ({ data }) => {
    const { headers } = getRequest()
    const session = await requirePlatformOwner(headers)
    const auth = getAuth()
    const db = getDb()

    // À qui ? L'invitation en cours le dit ; sinon l'adresse de contact de l'agence.
    const invited = await db
      .select({ email: invitations.email })
      .from(invitations)
      .where(and(eq(invitations.organizationId, data.organizationId), eq(invitations.role, 'owner')))
      .orderBy(desc(invitations.createdAt))
      .limit(1)

    const fallback = await db
      .select({ email: organizations.contactEmail })
      .from(organizations)
      .where(eq(organizations.id, data.organizationId))
      .limit(1)

    const email = invited[0]?.email ?? fallback[0]?.email
    if (!email) throw new Error('no owner address on file for this organization')

    const membership = { id: crypto.randomUUID(), userId: session.userId }
    await db.insert(members).values({
      id: membership.id,
      organizationId: data.organizationId,
      userId: membership.userId,
      role: 'owner',
      createdAt: new Date(),
    })

    try {
      await auth.api.createInvitation({
        body: { email, role: 'owner', organizationId: data.organizationId },
        headers,
      })
    } finally {
      // Dans un `finally` : si l'invitation échoue, le propriétaire de plateforme ne
      // doit PAS rester membre d'une organisation cliente.
      await db.delete(members).where(eq(members.id, membership.id))
    }

    await audit({
      orgId: data.organizationId,
      actorUserId: session.userId,
      action: 'invitation.resend',
      entityType: 'organization',
      entityId: data.organizationId,
      after: { email },
      request: { ip: getRequestIP() ?? null, userAgent: headers.get('user-agent') },
    })

    return { email }
  })

/**
 * Le flux principal du produit : créer l'organisation ET inviter son propriétaire,
 * en un geste. Une organisation sans invitation est une organisation que personne ne
 * peut ouvrir — la séparer en deux écrans serait une invitation à l'oublier.
 */
export const createOrganizationWithOwner = createServerFn({ method: 'POST' })
  .validator(CreateOrganizationInput)
  .handler(async ({ data }) => {
    const { headers } = getRequest()
    const session = await requirePlatformOwner(headers)
    const auth = getAuth()
    const db = getDb()

    const organization = await auth.api.createOrganization({
      body: {
        name: data.name,
        slug: data.slug,
        city: data.city ?? '',
        planCode: data.planCode,
        localeDefault: data.localeDefault,
        status: data.planCode === 'trial' ? 'trialing' : 'active',
      },
      headers,
    })
    if (!organization) throw new Error('organization not created')

    const invitation = await auth.api.createInvitation({
      body: { email: data.ownerEmail, role: 'owner', organizationId: organization.id },
      headers,
    })

    /**
     * Better Auth inscrit le CRÉATEUR comme membre (`creatorRole`). Or un
     * `platform_owner` n'est membre d'aucune organisation cliente : c'est la règle
     * qui sépare la plateforme de ses clients (docs/DOMAIN.md §3.1). On le retire
     * donc aussitôt l'invitation posée — l'ordre compte, créer l'invitation exige
     * d'être membre.
     */
    await db
      .delete(members)
      .where(
        and(eq(members.organizationId, organization.id), eq(members.userId, session.userId)),
      )

    await audit({
      orgId: organization.id,
      actorUserId: session.userId,
      action: 'organization.create',
      entityType: 'organization',
      entityId: organization.id,
      after: { name: data.name, planCode: data.planCode, ownerEmail: data.ownerEmail },
      request: { ip: getRequestIP() ?? null, userAgent: headers.get('user-agent') },
    })

    return { organizationId: organization.id, invitationId: invitation.id }
  })

export const StartImpersonationInput = z.object({
  organizationId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
})

/**
 * Impersonation — la fonctionnalité la plus dangereuse du produit.
 *
 * Quatre garde-fous, tous ici : durée de 30 minutes (Better Auth), écriture
 * DÉSACTIVÉE par défaut (`writeEnabled: false`), bandeau permanent côté écran, et
 * journalisation systématique. Aucun des quatre n'est facultatif.
 */
export const startImpersonation = createServerFn({ method: 'POST' })
  .validator(StartImpersonationInput)
  .handler(async ({ data }) => {
    const { headers } = getRequest()
    const session = await requirePlatformOwner(headers)
    const db = getDb()
    const auth = getAuth()

    // On entre toujours dans la peau du PROPRIÉTAIRE : c'est le compte qui voit
    // tout, donc celui qui permet de dépanner sans redemander un second accès.
    const owner = await db
      .select({ userId: members.userId })
      .from(members)
      .where(and(eq(members.organizationId, data.organizationId), eq(members.role, 'owner')))
      .orderBy(members.createdAt)
      .limit(1)

    /*
     * Pas de propriétaire = acte impossible, et il faut le NOMMER.
     *
     * L'ancien message parlait de « membre », ce qui était trompeur : une agence
     * peut très bien avoir trois membres et aucun propriétaire — l'invitation du
     * propriétaire n'a jamais été acceptée, ou son rôle a été changé. L'écran
     * grisait alors le bouton sur le mauvais critère (le nombre de membres) et
     * l'erreur, quand elle sortait, désignait la mauvaise cause.
     */
    const targetUserId = owner[0]?.userId
    if (!targetUserId) throw new Error('organization has no owner to impersonate')

    const response = await auth.api.impersonateUser({
      body: { userId: targetUserId },
      headers,
      asResponse: true,
    })

    // On relaie TOUS les `set-cookie` : la réponse en pose plusieurs (effacement de
    // l'ancienne session, mise de côté de la session administrateur, dépôt de la
    // nouvelle). N'en garder qu'un revient à ne pas être connecté du tout.
    const cookies = response.headers.getSetCookie()
    if (cookies.length > 0) setResponseHeader('set-cookie', cookies)

    const impersonated = await auth.api.getSession({ headers: cookieHeaderFrom(cookies) })
    const sessionId = impersonated?.session.id
    if (!sessionId) throw new Error('impersonation session not created')

    await auth.api.setActiveOrganization({
      body: { organizationId: data.organizationId },
      headers: cookieHeaderFrom(cookies),
    })

    await db.insert(impersonationSessions).values({
      sessionId,
      adminUserId: session.userId,
      targetUserId,
      orgId: data.organizationId,
      // Consultation seule. L'élévation est un second geste, explicite.
      writeEnabled: false,
      reason: data.reason ?? null,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    })

    await audit({
      orgId: data.organizationId,
      actorUserId: session.userId,
      actingAsOrgId: data.organizationId,
      impersonated: true,
      action: 'impersonation.start',
      entityType: 'user',
      entityId: targetUserId,
      after: { reason: data.reason ?? null, writeEnabled: false },
      request: { ip: getRequestIP() ?? null, userAgent: headers.get('user-agent') },
    })

    return { ok: true }
  })

export const stopImpersonation = createServerFn({ method: 'POST' }).handler(async () => {
  const { headers } = getRequest()
  const auth = getAuth()
  const db = getDb()

  const current = await auth.api.getSession({ headers })
  const sessionId = current?.session.id
  const adminUserId = (current?.session as { impersonatedBy?: string | null } | undefined)
    ?.impersonatedBy

  const response = await auth.api.stopImpersonating({ headers, asResponse: true })
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) setResponseHeader('set-cookie', cookies)

  if (sessionId) {
    await db
      .update(impersonationSessions)
      .set({ endedAt: new Date().toISOString() })
      .where(eq(impersonationSessions.sessionId, sessionId))
  }

  await audit({
    actorUserId: adminUserId ?? null,
    impersonated: true,
    action: 'impersonation.stop',
    request: { ip: getRequestIP() ?? null, userAgent: headers.get('user-agent') },
  })

  return { ok: true }
})

export type AdminUserSummary = { id: string; name: string; email: string }

export const describeOwner = createServerFn({ method: 'GET' })
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }): Promise<AdminUserSummary | null> => {
    const { headers } = getRequest()
    await requirePlatformOwner(headers)

    const rows = await getDb()
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, data.userId))
      .limit(1)
    return rows[0] ?? null
  })

/**
 * Les chiffres du tableau de bord de plateforme.
 *
 * L'agrégation vit dans `src/db/repositories/platform.ts` — le seul endroit du
 * produit autorisé à regarder toutes les organisations à la fois, et qui n'en
 * rapporte que des compteurs.
 */
export const fetchPlatformMetrics = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PlatformMetrics> => {
    const { headers } = getRequest()
    await requirePlatformOwner(headers)
    return platformMetrics(getDb())
  },
)
