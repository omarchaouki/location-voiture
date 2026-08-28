import { and, eq } from 'drizzle-orm'

import type { Db } from '~/db/client'
import { planFeatures, plans } from '~/db/schema/billing'
import type { TenantContext } from '~/db/tenant'
import type { PlanLimits } from '~/core/billing'
import { RECOMMENDED_FEATURE_KEY } from '~/core/plan-fit'

/**
 * `can(org, 'gps.track')` — l'autorisation par PLAN, décidée côté serveur.
 *
 * **Aucune valeur par défaut `db = getDb()` ici, et c'est important.** Une valeur par
 * défaut est une référence de VALEUR à `getDb` dans la signature : elle survit à
 * l'élagage du client et traîne `better-sqlite3` jusque dans le navigateur, où il
 * lève « promisify is not a function » et empêche React de s'hydrater. Toute la page
 * cesse alors de fonctionner en silence. Vécu le 25/08/2026 — voir docs/DECISIONS.md §13.7.
 *
 * La règle de docs/DOMAIN.md §3.2 : aucun `if (planCode === 'pro')` dans le code.
 * Le plan n'est qu'une clé de lecture dans `plan_features` ; changer l'offre
 * commerciale doit être une écriture en base, jamais un déploiement.
 *
 * Deux vérifications distinctes, à ne pas confondre :
 *  - le **rôle** dit ce que cette personne a le droit de faire (src/auth/permissions.ts) ;
 *  - le **plan** dit ce que cette organisation a payé.
 * Un propriétaire sur une offre d'entrée de gamme a tous les droits sur une
 * fonctionnalité qu'il n'a pas.
 */

/** Levée quand la fonctionnalité existe mais que le plan ne la couvre pas. */
export class FeatureLockedError extends Error {
  constructor(
    readonly featureKey: string,
    readonly planCode: string,
  ) {
    super(`feature ${featureKey} not in plan ${planCode}`)
    this.name = 'FeatureLockedError'
  }
}

/**
 * Matrice par défaut, appliquée au premier démarrage et jamais réappliquée par-dessus.
 *
 * Elle n'est PAS la source de vérité : `plan_features` l'est. Elle existe parce
 * qu'une base vierge doit produire un produit cohérent sans passer par un écran
 * d'administration — et `onConflictDoNothing` garantit qu'un choix commercial fait
 * en base ne sera jamais écrasé par un redémarrage.
 */
export const DEFAULT_PLAN_FEATURES: ReadonlyArray<{
  planCode: string
  featureKey: string
  enabled: boolean
}> = [
  // L'essai donne tout : une fonctionnalité qu'on ne voit pas est une fonctionnalité
  // qu'on n'achète pas.
  { planCode: 'trial', featureKey: 'gps.track', enabled: true },
  { planCode: 'starter', featureKey: 'gps.track', enabled: false },
  { planCode: 'pro', featureKey: 'gps.track', enabled: true },
  { planCode: 'business', featureKey: 'gps.track', enabled: true },

  { planCode: 'trial', featureKey: 'gps.geofence', enabled: true },
  { planCode: 'starter', featureKey: 'gps.geofence', enabled: false },
  { planCode: 'pro', featureKey: 'gps.geofence', enabled: true },
  { planCode: 'business', featureKey: 'gps.geofence', enabled: true },

  /*
   * L'offre MISE EN AVANT sur la page tarifaire.
   *
   * Ce n'est pas une autorisation : elle n'ouvre rien, et `can()` ne la lira jamais.
   * Elle vit ici parce que c'est la table qui porte déjà les marques PAR OFFRE, et
   * parce qu'ainsi changer la mise en avant reste une écriture en base — la vitrine
   * suit sans qu'une ligne de JSX bouge (`RECOMMENDED_FEATURE_KEY`).
   *
   * `pro` par défaut, et pas la plus chère : la mise en avant sert à orienter la
   * majorité, pas à vendre le haut du catalogue. Une seule offre la porte — deux
   * badges « conseillé » ne conseillent plus rien.
   */
  { planCode: 'pro', featureKey: RECOMMENDED_FEATURE_KEY, enabled: true },
]

/**
 * Les offres, et surtout leurs LIMITES.
 *
 * Mêmes précautions que la matrice de fonctionnalités : ce n'est pas la source de
 * vérité — `plans` l'est — mais une base vierge doit produire un produit cohérent.
 * `null` = illimité, jamais zéro.
 *
 * Les prix sont en centimes de dirham. Ils ne sont affichés nulle part pour l'instant :
 * la page tarifaire est en Phase 11, et **aucun montant ne sera annoncé à un client
 * avant d'avoir été validé commercialement**.
 */
export const DEFAULT_PLANS: ReadonlyArray<{
  code: string
  nameKey: string
  monthlyCents: number
  maxVehicles: number | null
  maxUsers: number | null
  maxBranches: number | null
  trialDays: number
  sortOrder: number
}> = [
  { code: 'trial', nameKey: 'plan.trial', monthlyCents: 0, maxVehicles: 5, maxUsers: 2, maxBranches: 1, trialDays: 14, sortOrder: 0 },
  { code: 'starter', nameKey: 'plan.starter', monthlyCents: 29_900, maxVehicles: 10, maxUsers: 3, maxBranches: 1, trialDays: 0, sortOrder: 1 },
  { code: 'pro', nameKey: 'plan.pro', monthlyCents: 79_900, maxVehicles: 40, maxUsers: 10, maxBranches: 3, trialDays: 0, sortOrder: 2 },
  { code: 'business', nameKey: 'plan.business', monthlyCents: 149_900, maxVehicles: null, maxUsers: null, maxBranches: null, trialDays: 0, sortOrder: 3 },
]

/** Pose les offres par défaut. Idempotent, comme la matrice. */
export async function ensurePlans(db: Db): Promise<number> {
  const inserted = await db
    .insert(plans)
    .values(
      DEFAULT_PLANS.map((plan) => ({
        code: plan.code,
        nameKey: plan.nameKey,
        monthlyCents: plan.monthlyCents,
        yearlyCents: plan.monthlyCents * 10,
        maxVehicles: plan.maxVehicles,
        maxUsers: plan.maxUsers,
        maxBranches: plan.maxBranches,
        trialDays: plan.trialDays,
        sortOrder: plan.sortOrder,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: plans.id })

  return inserted.length
}

/**
 * Limites de l'offre d'une organisation.
 *
 * Lues en base, jamais dans le code : changer une limite doit être une écriture, pas
 * un déploiement. Une offre inconnue ne donne AUCUNE limite ouverte — elle bloque tout
 * plutôt que d'ouvrir tout, parce qu'un plan mal saisi ne doit pas offrir l'illimité.
 */
export async function planLimits(planCode: string, db: Db): Promise<PlanLimits> {
  const rows = await db
    .select({
      maxVehicles: plans.maxVehicles,
      maxUsers: plans.maxUsers,
      maxBranches: plans.maxBranches,
    })
    .from(plans)
    .where(eq(plans.code, planCode))
    .limit(1)

  return rows[0] ?? { maxVehicles: 0, maxUsers: 0, maxBranches: 0 }
}

/** Pose la matrice par défaut. Idempotent : c'est l'index unique qui le garantit. */
export async function ensurePlanFeatures(db: Db): Promise<number> {
  const inserted = await db
    .insert(planFeatures)
    .values(
      DEFAULT_PLAN_FEATURES.map((feature) => ({
        planCode: feature.planCode,
        featureKey: feature.featureKey,
        enabled: feature.enabled,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: planFeatures.id })

  return inserted.length
}

/**
 * La fonctionnalité est-elle ouverte à cette organisation ?
 *
 * `plan_features` est une table de PLATEFORME : elle n'a pas d'`org_id` et n'est
 * donc pas cloisonnée. La donnée cloisonnée, c'est le plan de l'organisation, qui
 * vient du `TenantContext` — donc de la session, jamais d'un paramètre.
 */
export async function can(ctx: TenantContext, featureKey: string, db: Db): Promise<boolean> {
  const rows = await db
    .select({ enabled: planFeatures.enabled })
    .from(planFeatures)
    .where(and(eq(planFeatures.planCode, ctx.planCode), eq(planFeatures.featureKey, featureKey)))
    .limit(1)

  // Absence de ligne = fonctionnalité fermée. Le silence n'ouvre rien.
  return rows[0]?.enabled === true
}

export async function assertFeature(
  ctx: TenantContext,
  featureKey: string,
  db: Db,
): Promise<void> {
  if (!(await can(ctx, featureKey, db))) {
    throw new FeatureLockedError(featureKey, ctx.planCode)
  }
}
