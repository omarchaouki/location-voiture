import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { and, eq, gt } from 'drizzle-orm'
import { z } from 'zod'

import { getAuth } from '~/auth/server'
import { getDb } from '~/db/client'
import { invitations, organizations, users } from '~/db/schema/auth'
import { cookieHeaderFrom } from './cookies'

/**
 * Acceptation d'une invitation — le seul chemin par lequel un client entre.
 *
 * Le lien porte l'identifiant de l'invitation. Ce n'est pas un secret suffisant à
 * lui seul : l'adresse électronique de l'invitation est vérifiée côté serveur, et le
 * compte créé l'est forcément pour cette adresse-là. Une invitation consommée,
 * révoquée ou expirée ne donne plus rien.
 */

export interface InvitationView {
  state: 'pending' | 'unusable'
  organizationName: string
  email: string
  role: string
  /** Vrai si un compte existe déjà : la personne doit se connecter, pas s'inscrire. */
  accountExists: boolean
}

export const readInvitation = createServerFn({ method: 'GET' })
  .validator(z.object({ invitationId: z.string().min(1) }))
  .handler(async ({ data }): Promise<InvitationView> => {
    const db = getDb()
    const rows = await db
      .select({
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        organizationName: organizations.name,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .where(eq(invitations.id, data.invitationId))
      .limit(1)

    const invitation = rows[0]
    const usable =
      invitation !== undefined &&
      invitation.status === 'pending' &&
      invitation.expiresAt.getTime() > Date.now()

    if (!invitation || !usable) {
      // On ne dit RIEN de plus qu'« inutilisable » : ni l'adresse, ni l'organisation.
      return { state: 'unusable', organizationName: '', email: '', role: '', accountExists: false }
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invitation.email))
      .limit(1)

    return {
      state: 'pending',
      organizationName: invitation.organizationName,
      email: invitation.email,
      role: invitation.role ?? 'viewer',
      accountExists: existing.length > 0,
    }
  })

export const AcceptInvitationInput = z.object({
  invitationId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(10).max(200),
})

/**
 * Crée le compte, accepte l'invitation, ouvre la session et active l'organisation.
 *
 * Quatre étapes indissociables : si l'une échoue, l'utilisateur se retrouverait avec
 * un compte sans organisation, c'est-à-dire un écran vide sans explication.
 */
export const acceptInvitation = createServerFn({ method: 'POST' })
  .validator(AcceptInvitationInput)
  .handler(async ({ data }) => {
    const db = getDb()
    const auth = getAuth()

    const rows = await db
      .select({ email: invitations.email, organizationId: invitations.organizationId })
      .from(invitations)
      .where(
        and(
          eq(invitations.id, data.invitationId),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1)

    const invitation = rows[0]
    if (!invitation) throw new Error('invitation unusable')

    // L'adresse vient de l'INVITATION, jamais du formulaire : on ne laisse pas
    // choisir pour qui on crée le compte.
    const signUp = await auth.api.signUpEmail({
      body: { email: invitation.email, password: data.password, name: data.name },
      asResponse: true,
    })
    if (!signUp.ok) throw new Error('sign up refused')

    const cookies = signUp.headers.getSetCookie()
    const headers = cookieHeaderFrom(cookies)

    await auth.api.acceptInvitation({ body: { invitationId: data.invitationId }, headers })
    await auth.api.setActiveOrganization({
      body: { organizationId: invitation.organizationId },
      headers,
    })

    if (cookies.length > 0) setResponseHeader('set-cookie', cookies)
    return { ok: true }
  })
