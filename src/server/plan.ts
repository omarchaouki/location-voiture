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
  { planCode: 'premium', featureKey: 'gps.track', enabled: true },

  { planCode: 'trial', featureKey: 'gps.geofence', enabled: true },
  { planCode: 'starter', featureKey: 'gps.geofence', enabled: false },
  { planCode: 'pro', featureKey: 'gps.geofence', enabled: true },
  { planCode: 'business', featureKey: 'gps.geofence', enabled: true },
  { planCode: 'premium', featureKey: 'gps.geofence', enabled: true },

  /*
   * MODELE DE CONTRAT PERSONNALISABLE.
   *
   * Absent de l'offre d'entree : c'est la fonctionnalite qui fait monter en gamme une
   * agence qui a deja son contrat type chez l'imprimeur. L'essai la donne, comme tout
   * le reste, parce qu'une fonctionnalite qu'on ne voit pas est une fonctionnalite
   * qu'on n'achete pas.
   */
  { planCode: 'trial', featureKey: 'contract.template', enabled: true },
  { planCode: 'starter', featureKey: 'contract.template', enabled: false },
  { planCode: 'pro', featureKey: 'contract.template', enabled: true },
  { planCode: 'business', featureKey: 'contract.template', enabled: true },
  { planCode: 'premium', featureKey: 'contract.template', enabled: true },

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
 * DURÉE D'ESSAI, la même pour toutes les offres : deux mois.
 *
 * Une seule constante, et pas quatre nombres recopiés, parce que c'est une promesse
 * commerciale unique — « deux mois gratuits, quelle que soit l'offre ». Écrite quatre
 * fois, elle finit par valoir 60 sur trois lignes et 30 sur la quatrième, et c'est le
 * client de la quatrième qui appelle.
 *
 * Soixante jours et non trente : le concurrent direct en donne trente (relevé le
 * 28/08/2026 sur locaflotte.com). Un loueur ne juge pas un logiciel de gestion sur une
 * semaine de découverte — il le juge sur un cycle complet de location, de la réservation
 * au retour, caution rendue. Trente jours suffisent à peine à en voir un.
 */
export const TRIAL_DAYS = 60

/**
 * Les offres, et surtout leurs LIMITES.
 *
 * Mêmes précautions que la matrice de fonctionnalités : ce n'est pas la source de
 * vérité — `plans` l'est — mais une base vierge doit produire un produit cohérent.
 * `null` = illimité, jamais zéro.
 *
 * Les prix sont en centimes de dirham.
 *
 * **La grille est calée sur le concurrent direct**, relevé le 28/08/2026 sur
 * locaflotte.com : 99 MAD pour 8 véhicules et 2 utilisateurs, 199 pour 25 et 5, 299
 * pour 50 et 10, l'illimité sur devis. Chaque palier d'ici est moins cher ET plus
 * généreux que le sien, et le haut du catalogue affiche un prix là où lui demande
 * d'appeler :
 *
 * | offre    | ici              | en face          |
 * |----------|------------------|------------------|
 * | starter  | 89 — 10 véh / 3 u | 99 — 8 véh / 2 u  |
 * | pro      | 179 — 30 / 8      | 199 — 25 / 5      |
 * | business | 279 — 60 / 15     | 299 — 50 / 10     |
 * | premium  | 449 — illimité    | sur devis         |
 *
 * `trial` reste dans le catalogue mais N'EST PLUS PUBLIC : depuis que les quatre
 * offres payantes portent leurs soixante jours d'essai, une carte « Essai » sur la
 * page tarifaire ne se compare à rien. Elle sert encore de plan de repli en base —
 * une organisation dont l'offre a été effacée n'obtient pas l'illimité par accident.
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
  isPublic: boolean
}> = [
  { code: 'trial', nameKey: 'plan.trial', monthlyCents: 0, maxVehicles: 5, maxUsers: 2, maxBranches: 1, trialDays: TRIAL_DAYS, sortOrder: 0, isPublic: false },
  { code: 'starter', nameKey: 'plan.starter', monthlyCents: 8_900, maxVehicles: 10, maxUsers: 3, maxBranches: 1, trialDays: TRIAL_DAYS, sortOrder: 1, isPublic: true },
  { code: 'pro', nameKey: 'plan.pro', monthlyCents: 17_900, maxVehicles: 30, maxUsers: 8, maxBranches: 5, trialDays: TRIAL_DAYS, sortOrder: 2, isPublic: true },
  { code: 'business', nameKey: 'plan.business', monthlyCents: 27_900, maxVehicles: 60, maxUsers: 15, maxBranches: 10, trialDays: TRIAL_DAYS, sortOrder: 3, isPublic: true },
  { code: 'premium', nameKey: 'plan.premium', monthlyCents: 44_900, maxVehicles: null, maxUsers: null, maxBranches: null, trialDays: TRIAL_DAYS, sortOrder: 4, isPublic: true },
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
        isPublic: plan.isPublic,
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
