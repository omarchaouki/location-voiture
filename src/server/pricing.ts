import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'

import { getDb } from '~/db/client'
import { plans } from '~/db/schema/billing'

/**
 * Les offres, telles qu'elles sont affichées sur le site.
 *
 * **Elles sont LUES EN BASE, jamais écrites dans la page.** C'est la même règle que
 * pour les autorisations (`src/server/plan.ts`) et pour la même raison : changer un
 * prix doit être une écriture, pas un déploiement. Un tarif codé dans le JSX finit
 * toujours par contredire celui de la facture.
 *
 * Ce fichier ne contient QUE des server functions : il est importé par la page
 * vitrine, donc par le paquet client, et seuls les corps de gestionnaires en sont
 * retirés.
 */

export interface PublicPlan {
  code: string
  nameKey: string
  monthlyCents: number
  yearlyCents: number
  currency: string
  /** `null` = illimité. */
  maxVehicles: number | null
  maxUsers: number | null
  maxBranches: number | null
  trialDays: number
}

export const listPublicPlans = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublicPlan[]> => {
    return getDb()
      .select({
        code: plans.code,
        nameKey: plans.nameKey,
        monthlyCents: plans.monthlyCents,
        yearlyCents: plans.yearlyCents,
        currency: plans.currency,
        maxVehicles: plans.maxVehicles,
        maxUsers: plans.maxUsers,
        maxBranches: plans.maxBranches,
        trialDays: plans.trialDays,
      })
      .from(plans)
      .where(eq(plans.isPublic, true))
      .orderBy(asc(plans.sortOrder))
  },
)
