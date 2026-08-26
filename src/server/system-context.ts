import { isNull } from 'drizzle-orm'

import type { Db } from '~/db/client'
import { organizations } from '~/db/schema/auth'
import type { TenantContext } from '~/db/tenant'

/**
 * Contexte SYSTÈME — celui des travaux périodiques, qui n'ont pas d'utilisateur.
 *
 * Ce n'est pas une porte dérobée : il porte un `orgId` comme n'importe quel autre
 * contexte, donc tout ce qu'il touche reste cloisonné. Ce qu'il n'a pas, c'est une
 * session — et c'est pour cela qu'il ne se construit qu'ICI, à partir d'une ligne
 * `organizations` lue en base, jamais à partir d'un paramètre reçu.
 *
 * Il porte aussi le `planCode` : un balayage qui ignorerait le plan ferait tourner
 * le GPS chez des clients qui ne l'ont pas souscrit.
 */
export function systemContext(orgId: string, planCode: string): TenantContext {
  return {
    orgId,
    userId: 'system',
    role: 'owner',
    planCode,
    impersonated: false,
    canWrite: true,
    isDemo: false,
  }
}

/** Toutes les organisations vivantes, avec ce qu'il faut pour bâtir leur contexte. */
export async function listLiveOrganizations(
  db: Db,
): Promise<Array<{ id: string; planCode: string }>> {
  return db
    .select({ id: organizations.id, planCode: organizations.planCode })
    .from(organizations)
    .where(isNull(organizations.deletedAt))
}
