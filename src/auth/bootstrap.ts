import { eq } from 'drizzle-orm'

import type { Db } from '~/db/client'
import { users } from '~/db/schema/auth'
import { PLATFORM_OWNER } from './permissions'
import { closeBootstrapWindow, openBootstrapWindow, type Auth } from './server'

/**
 * Création du compte de plateforme — le tien.
 *
 * Appelé par `pnpm admin:create` et par les tests, jamais par une route web. Le
 * cahier des charges est explicite : « un compte, le mien, créé par une commande et
 * non par un formulaire web ».
 *
 * La fenêtre d'amorçage est ouverte le temps de l'appel, puis refermée dans un
 * `finally` — même en cas d'erreur, elle ne reste pas ouverte.
 */
export interface PlatformOwnerInput {
  email: string
  password: string
  name: string
}

export async function createPlatformOwner(
  db: Db,
  auth: Auth,
  input: PlatformOwnerInput,
): Promise<{ userId: string }> {
  const email = input.email.trim().toLowerCase()

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (existing.length > 0) {
    throw new Error(`Un compte existe déjà pour ${email}`)
  }

  openBootstrapWindow()
  let userId: string
  try {
    const response = await auth.api.signUpEmail({
      body: { email, password: input.password, name: input.name },
      asResponse: true,
    })
    const body = (await response.clone().json()) as { user?: { id?: string } }
    const created = body.user?.id
    if (!created) {
      throw new Error(`Création refusée : ${await response.clone().text()}`)
    }
    userId = created
  } finally {
    closeBootstrapWindow()
  }

  // La promotion se fait en base, sans passer par le réseau : il ne doit exister
  // aucun appel HTTP capable d'accorder le rôle de plateforme.
  await db.update(users).set({ role: PLATFORM_OWNER }).where(eq(users.id, userId))

  return { userId }
}
