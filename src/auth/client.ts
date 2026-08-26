import { createAuthClient } from 'better-auth/react'
import { adminClient, organizationClient } from 'better-auth/client/plugins'

import { ac, roles } from './permissions'

/**
 * Client d'authentification (navigateur).
 *
 * Il ne sert qu'aux ACTIONS : se connecter, se déconnecter, accepter une invitation.
 * Il ne sert JAMAIS à décider d'un droit : l'autorisation est calculée côté serveur
 * par `requireTenant` / `requireRole`, et les écrans ne font que refléter le résultat.
 */
export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles }), adminClient()],
})

export const { signIn, signOut, signUp, useSession } = authClient
