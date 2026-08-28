/**
 * QUELLE OFFRE POUR CETTE AGENCE — la règle, sans un seul code d'offre.
 *
 * Le questionnaire de la page d'accueil pose quatre questions et doit répondre par un
 * nom d'offre. La tentation évidente serait d'écrire la réponse :
 * `if (vehicles > 40) return 'business'`. C'est exactement ce que docs/DOMAIN.md §3.2
 * interdit partout ailleurs dans le produit, et pour la raison qui vaut aussi ici :
 * le jour où le commercial déplace une limite en base, la vitrine continuerait à
 * conseiller l'ancienne — et à conseiller de travers, ce qui est pire que de se taire.
 *
 * Ce module ne connaît donc AUCUN code d'offre. Il reçoit le catalogue tel qu'il sort
 * de la base et applique deux règles :
 *
 *  1. une offre CONVIENT si chacune de ses limites couvre le besoin et si elle porte
 *     toutes les fonctionnalités demandées ;
 *  2. entre deux offres qui conviennent, la MOINS CHÈRE gagne.
 *
 * `null` veut dire illimité des deux côtés — côté limite comme côté besoin — et c'est
 * la seule subtilité du fichier : « je ne sais pas combien, beaucoup » ne se laisse
 * couvrir que par « autant que vous voulez ».
 */

/**
 * L'offre MISE EN AVANT sur la page tarifaire, telle qu'elle est marquée en base.
 *
 * C'est une clé de `plan_features`, et non une colonne de `plans` — délibérément.
 * Deux raisons, dans cet ordre :
 *
 *  1. **Aucun code d'offre n'entre dans le JSX.** `plan.code === 'pro'` dans la
 *     vitrine serait exactement le défaut que docs/DOMAIN.md §3.2 interdit partout
 *     ailleurs, et il se paierait le jour où l'offre conseillée change ;
 *  2. **changer la mise en avant reste une ÉCRITURE, pas un déploiement.** C'est la
 *     même règle que pour les prix : une ligne dans `plan_features`, et la page suit.
 *
 * Elle ne donne accès à rien. C'est une marque commerciale posée dans la table qui
 * porte déjà les marques par offre, pas une autorisation — `can()` ne la lira jamais
 * parce qu'aucun écran ne la demande.
 */
export const RECOMMENDED_FEATURE_KEY = 'plan.recommended'

export interface PlanNeeds {
  /** `null` = plus que le plus grand palier proposé, donc « illimité ». */
  vehicles: number | null
  users: number | null
  branches: number | null
  /** Clés de fonctionnalité exigées (`gps.track`, `gps.geofence`…). */
  features: readonly string[]
}

export interface FittablePlan {
  code: string
  monthlyCents: number
  maxVehicles: number | null
  maxUsers: number | null
  maxBranches: number | null
  trialDays: number
  features: readonly string[]
}

/**
 * Une limite couvre-t-elle un besoin ?
 *
 * Illimité couvre tout. Un besoin illimité n'est couvert QUE par l'illimité — et
 * surtout pas par « la plus grande valeur trouvée », qui donnerait une réponse fausse
 * au client qui en a le plus besoin.
 */
export function limitCovers(limit: number | null, need: number | null): boolean {
  if (limit === null) return true
  if (need === null) return false
  return limit >= need
}

export function planCovers(plan: FittablePlan, needs: PlanNeeds): boolean {
  return (
    limitCovers(plan.maxVehicles, needs.vehicles) &&
    limitCovers(plan.maxUsers, needs.users) &&
    limitCovers(plan.maxBranches, needs.branches) &&
    needs.features.every((feature) => plan.features.includes(feature))
  )
}

export interface PlanRecommendation<T extends FittablePlan> {
  /** L'offre conseillée. `null` seulement si le catalogue est vide. */
  plan: T | null
  /**
   * Vrai quand AUCUNE offre ne couvre le besoin et qu'on a rendu la plus large.
   *
   * Le cas ne devrait pas se produire — la plus haute offre est illimitée — mais un
   * catalogue se modifie en base, et une recommandation silencieusement fausse est
   * pire qu'un « parlons-en ». L'écran s'en sert pour changer de ton.
   */
  approximate: boolean
  /** L'offre d'ESSAI qui couvre aussi ce besoin, s'il en existe une. */
  trial: T | null
}

/**
 * L'offre conseillée, et l'essai s'il couvre le même besoin.
 *
 * Les offres d'ESSAI sont écartées du conseil principal. Elles se reconnaissent à
 * `trialDays > 0`, ce qui est leur définition dans ce modèle — pas à leur code, ni à
 * leur prix nul. Sans cette mise à l'écart, l'essai gratuit serait toujours le moins
 * cher, donc toujours conseillé, et une agence de trois voitures ne verrait jamais
 * l'offre qu'elle prendra le quinzième jour.
 *
 * L'essai n'est pas caché pour autant : il revient à part, et l'écran l'annonce comme
 * un point de départ plutôt que comme une réponse.
 */
export function recommendPlan<T extends FittablePlan>(
  plans: readonly T[],
  needs: PlanNeeds,
): PlanRecommendation<T> {
  const byPrice = [...plans].sort((a, b) => a.monthlyCents - b.monthlyCents)
  const subscriptions = byPrice.filter((plan) => plan.trialDays === 0)

  const fitting = subscriptions.find((plan) => planCovers(plan, needs))
  const trial = byPrice.find((plan) => plan.trialDays > 0 && planCovers(plan, needs)) ?? null

  if (fitting) return { plan: fitting, approximate: false, trial }

  // Rien ne couvre : on rend la plus large plutôt que rien, et on le DIT.
  const widest = subscriptions.at(-1) ?? byPrice.at(-1) ?? null
  return { plan: widest, approximate: widest !== null, trial }
}
