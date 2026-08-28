import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'

import { RECOMMENDED_FEATURE_KEY } from '~/core/plan-fit'
import { getDb } from '~/db/client'
import { planFeatures, plans } from '~/db/schema/billing'

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
  /**
   * Les clés de fonctionnalité ACTIVÉES pour cette offre, lues dans `plan_features`.
   *
   * Elles sortent d'ici pour une raison précise : le questionnaire d'orientation de
   * la page d'accueil doit pouvoir répondre « il vous faut le suivi GPS » sans
   * qu'aucun code d'offre n'apparaisse dans le JSX. La règle de docs/DOMAIN.md §3.2
   * vaut aussi pour la vitrine — `if (plan.code === 'pro')` y serait le même défaut
   * qu'ailleurs, et se paierait le jour où l'offre commerciale change.
   */
  features: string[]
  /**
   * L'offre MISE EN AVANT — un badge « conseillé » sur la page tarifaire.
   *
   * Dérivée ici, et pas laissée à la page, pour que le JSX n'ait à connaître ni le
   * code de l'offre ni la clé de fonctionnalité qui la marque. La vitrine reçoit un
   * booléen ; la décision reste entièrement en base (`RECOMMENDED_FEATURE_KEY`).
   */
  isRecommended: boolean
}

export const listPublicPlans = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublicPlan[]> => {
    const db = getDb()

    const rows = await db
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

    /*
     * Deux requêtes plutôt qu'une jointure, et c'est délibéré : une jointure
     * multiplierait chaque offre par son nombre de fonctionnalités, et il faudrait
     * regrouper à la main de toute façon. Le catalogue tient en quatre lignes et une
     * dizaine de clés — la seconde requête ne se mesure pas.
     */
    const granted = await db
      .select({ planCode: planFeatures.planCode, featureKey: planFeatures.featureKey })
      .from(planFeatures)
      .where(eq(planFeatures.enabled, true))

    const byPlan = new Map<string, string[]>()
    for (const row of granted) {
      const list = byPlan.get(row.planCode)
      if (list) list.push(row.featureKey)
      else byPlan.set(row.planCode, [row.featureKey])
    }

    return rows.map((plan) => {
      const features = byPlan.get(plan.code) ?? []
      return {
        ...plan,
        /*
         * La marque de mise en avant sort de la liste des fonctionnalités.
         *
         * Elle y est rangée parce que `plan_features` est la table des marques par
         * offre, mais ce n'est pas une capacité du produit : la laisser dans
         * `features` la ferait apparaître dans le questionnaire d'orientation, qui
         * exige que l'offre porte TOUTES les clés demandées. Une offre non conseillée
         * cesserait alors de convenir à qui ne demande rien de particulier.
         */
        features: features.filter((key) => key !== RECOMMENDED_FEATURE_KEY),
        isRecommended: features.includes(RECOMMENDED_FEATURE_KEY),
      }
    })
  },
)
