import { createPlatformOwner } from '~/auth/bootstrap'
import { createAuth, type Auth } from '~/auth/server'
import type { Db } from '~/db/client'
import { cookieHeaderFrom } from '~/server/cookies'
import { setNotifier, type NotificationMessage } from '~/server/notifier'

/**
 * Outillage d'authentification pour les tests.
 *
 * Les tests passent par la VRAIE pile Better Auth — pas par un faux. C'est le seul
 * moyen de prouver que le cloisonnement tient sur le chemin réel : session →
 * `activeOrganizationId` → `TenantContext`.
 */

export function createTestAuth(db: Db, options: { joins?: boolean } = {}): Auth {
  return createAuth(db, options)
}

/** Capture les notifications au lieu de les afficher, pour pouvoir les inspecter. */
export function captureNotifications(): NotificationMessage[] {
  const sent: NotificationMessage[] = []
  setNotifier({
    id: 'test',
    send(message) {
      sent.push(message)
      return Promise.resolve()
    },
  })
  return sent
}

export interface SignedInUser {
  userId: string
  email: string
  /** En-têtes à rejouer pour authentifier les appels suivants. */
  headers: Headers
}

/** Les cookies d'une réponse Better Auth, prêts à être rejoués. */
export function headersFrom(response: Response): Headers {
  return cookieHeaderFrom(response.headers.getSetCookie())
}

export async function signUp(
  auth: Auth,
  input: { email: string; password: string; name: string },
): Promise<SignedInUser> {
  const response = await auth.api.signUpEmail({
    body: input,
    asResponse: true,
  })
  const body = (await response.clone().json()) as { user?: { id?: string } }
  const userId = body.user?.id
  if (!userId) throw new Error(`signUp failed: ${await response.clone().text()}`)
  return { userId, email: input.email, headers: headersFrom(response) }
}

export async function signIn(
  auth: Auth,
  input: { email: string; password: string },
): Promise<SignedInUser> {
  const response = await auth.api.signInEmail({ body: input, asResponse: true })
  const body = (await response.clone().json()) as { user?: { id?: string } }
  const userId = body.user?.id
  if (!userId) throw new Error(`signIn failed: ${await response.clone().text()}`)
  return { userId, email: input.email, headers: headersFrom(response) }
}

/**
 * Crée le compte de plateforme puis ouvre sa session.
 *
 * Passe par le MÊME chemin que `pnpm admin:create` : il ne doit exister aucun
 * raccourci réservé aux tests, sinon les tests ne prouvent plus rien.
 */
export async function bootstrapAdmin(
  db: Db,
  auth: Auth,
  input: { email: string; password: string; name: string },
): Promise<SignedInUser> {
  await createPlatformOwner(db, auth, input)
  return signIn(auth, { email: input.email, password: input.password })
}
