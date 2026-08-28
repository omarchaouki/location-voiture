import { addCivilDays, civilDaysBetween, type CivilDate } from './dates'

/**
 * ABONNEMENT ET FACTURATION — la logique, sans base ni horloge.
 *
 * Trois choses délicates vivent ici, et une seule est technique :
 *
 *  1. **La TVA se calcule en centimes entiers**, jamais en flottant. `19,99 × 0,20`
 *     ne vaut pas ce qu'on croit en binaire, et une facture fausse d'un centime est
 *     une facture fausse.
 *  2. **Le numéro de facture est une obligation légale**, pas une préférence : la
 *     séquence doit être continue, sans trou (docs/DOMAIN.md, invariant 9).
 *  3. **Le passage en lecture seule est une décision commerciale à effet juridique** :
 *     couper l'accès trop tôt, c'est bloquer un client qui a payé en retard ; trop
 *     tard, c'est travailler gratuitement.
 */

/* -------------------------------------------------------------------- argent */

/** TVA marocaine par défaut, en points de base : 2000 = 20 %. Entier, jamais 0.20. */
export const DEFAULT_VAT_RATE_BP = 2000

export interface InvoiceTotals {
  subtotalCents: number
  vatCents: number
  totalCents: number
}

/**
 * Totaux d'une facture, à partir d'un montant hors taxes.
 *
 * L'arrondi se fait UNE fois, sur la TVA, et le total est la somme des deux — pas
 * l'inverse. Calculer le total puis en déduire la TVA fait apparaître des écarts d'un
 * centime entre le pied de facture et la ligne de TVA, et c'est exactement ce qu'un
 * contrôle fiscal regarde.
 *
 * `Math.round` sur un entier de centimes multiplié par des points de base : la seule
 * division est par 10 000, et elle arrive en dernier.
 */
export function invoiceTotals(subtotalCents: number, vatRateBp = DEFAULT_VAT_RATE_BP): InvoiceTotals {
  const vatCents = Math.round((subtotalCents * vatRateBp) / 10_000)
  return { subtotalCents, vatCents, totalCents: subtotalCents + vatCents }
}

/** Montant hors taxes correspondant à un montant TTC. Sert aux prix annoncés TTC. */
export function subtotalFromTotal(totalCents: number, vatRateBp = DEFAULT_VAT_RATE_BP): number {
  return Math.round((totalCents * 10_000) / (10_000 + vatRateBp))
}

/* ------------------------------------------------------- mensuel ou annuel */

/**
 * LES DEUX RYTHMES DE PAIEMENT, et l'annuel EN PREMIER.
 *
 * L'ordre du tableau est celui des boutons, et il porte la valeur par défaut : la
 * page tarifaire s'ouvre sur l'annuel. Ce n'est pas un réglage cosmétique — c'est le
 * prix par mois le plus BAS qui s'affiche en premier, donc celui auquel le visiteur
 * compare tout le reste. Montrer le mensuel d'abord fait paraître le produit un
 * cinquième plus cher qu'il ne l'est pour qui s'engage à l'année.
 */
export const BILLING_PERIODS = ['yearly', 'monthly'] as const
export type BillingPeriod = (typeof BILLING_PERIODS)[number]

export const DEFAULT_BILLING_PERIOD: BillingPeriod = 'yearly'

/**
 * Combien de MOIS l'engagement annuel offre-t-il ?
 *
 * Calculé, jamais écrit. Le catalogue pose aujourd'hui `yearlyCents = monthlyCents × 10`,
 * soit deux mois offerts — mais c'est une donnée en base, pas une constante du produit.
 * Écrire « 2 mois offerts » dans la page, c'est signer une promesse que la prochaine
 * grille tarifaire démentira sans prévenir, exactement comme un prix codé dans le JSX.
 *
 * Le résultat est arrondi au demi-mois près puis rendu en nombre ENTIER de mois : une
 * remise commerciale s'annonce en mois pleins, et « 1,97 mois offert » ne se dit pas.
 * Zéro quand l'annuel n'offre rien — l'écran n'affiche alors aucune promesse.
 */
export function monthsFreeOnYearly(monthlyCents: number, yearlyCents: number): number {
  if (monthlyCents <= 0 || yearlyCents <= 0) return 0
  const saved = monthlyCents * 12 - yearlyCents
  if (saved <= 0) return 0
  return Math.round(saved / monthlyCents)
}

/** Ce que l'engagement annuel fait économiser sur douze mois, en centimes. */
export function yearlySavingsCents(monthlyCents: number, yearlyCents: number): number {
  return Math.max(0, monthlyCents * 12 - yearlyCents)
}

/**
 * Le prix PAR MOIS d'un engagement annuel.
 *
 * C'est le nombre qu'on affiche sous l'annuel, parce que c'est le seul qui se compare
 * au mensuel. Montrer « 7 990 MAD / an » à côté de « 799 MAD / mois » demande une
 * division mentale que personne ne fait — et celui qui la fait de travers s'en va.
 *
 * L'arrondi tombe au centime, et le total annoncé pour l'année reste `yearlyCents` :
 * on n'affiche jamais douze fois ce nombre-ci, qui ne retomberait pas juste.
 */
export function monthlyEquivalentCents(yearlyCents: number): number {
  return Math.round(yearlyCents / 12)
}

/**
 * Le prix à afficher pour une offre, selon le rythme choisi.
 *
 * Toujours ramené au MOIS : la page compare des mensualités, quel que soit le rythme.
 */
export function displayedMonthlyCents(
  period: BillingPeriod,
  monthlyCents: number,
  yearlyCents: number,
): number {
  return period === 'yearly' ? monthlyEquivalentCents(yearlyCents) : monthlyCents
}

/* ------------------------------------------------------------------- numéro */

/**
 * Numéro de facture : `AAAA-NNNNNN`, par organisation ÉMETTRICE et par année.
 *
 * Même forme que la référence de contrat (`src/core/rental.ts`) : un carnet à souches
 * remis à zéro chaque année, ce qui est l'usage marocain.
 *
 * **Point à confirmer avec un comptable** (docs/DECISIONS.md §9, point 5) : l'invariant
 * 9 exige une séquence « continue, sans trou, par organisation émettrice » sans dire si
 * la remise à zéro annuelle est admise. Elle l'est en pratique — chaque millésime forme
 * sa propre série continue — mais ce n'est pas à moi de trancher un point fiscal. La
 * décision tient en une fonction : la changer coûte une ligne, pas une migration.
 */
export function nextInvoiceNumber(year: number, lastNumber: string | null): string {
  const prefix = String(year)
  const sequence =
    lastNumber && lastNumber.startsWith(prefix)
      ? Number.parseInt(lastNumber.slice(5), 10) + 1
      : 1
  return `${prefix}-${String(sequence).padStart(6, '0')}`
}

/** Le numéro attendu juste après celui-ci — sert à prouver l'absence de trou. */
export function isConsecutive(previous: string, next: string): boolean {
  return nextInvoiceNumber(Number(next.slice(0, 4)), previous) === next
}

/* ------------------------------------------------------------------- quotas */

export type CounterKey = 'vehicles' | 'users' | 'branches'

export interface PlanLimits {
  /** `null` = illimité. */
  maxVehicles: number | null
  maxUsers: number | null
  maxBranches: number | null
}

export interface QuotaVerdict {
  allowed: boolean
  counter: CounterKey
  current: number
  /** `null` = illimité. */
  limit: number | null
}

const LIMIT_OF: Record<CounterKey, keyof PlanLimits> = {
  vehicles: 'maxVehicles',
  users: 'maxUsers',
  branches: 'maxBranches',
}

/**
 * Reste-t-il de la place pour UNE unité de plus ?
 *
 * Le quota se vérifie AVANT l'écriture et côté serveur. Le front affiche la
 * consommation ; il ne décide de rien (docs/DOMAIN.md §3.2).
 *
 * `null` veut dire illimité et non zéro — l'inverse bloquerait toutes les offres
 * hautes, qui sont précisément celles qui n'ont pas de limite.
 */
export function checkQuota(counter: CounterKey, current: number, limits: PlanLimits): QuotaVerdict {
  const limit = limits[LIMIT_OF[counter]]
  return { allowed: limit === null || current < limit, counter, current, limit }
}

/* -------------------------------------------------- cycle de vie d'un abonnement */

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'read_only'
  | 'cancelled'

export interface SubscriptionState {
  status: SubscriptionStatus
  /** Fin d'essai, date civile. */
  trialEndsOn: CivilDate | null
  /** Fin de la période payée. */
  periodEndsOn: CivilDate | null
  /** Fin de la période de grâce après impayé. */
  graceUntilOn: CivilDate | null
  cancelAtPeriodEnd: boolean
}

/**
 * Période de grâce après un impayé : sept jours, puis lecture seule.
 *
 * Sept jours parce qu'un virement marocain entre deux banques met couramment trois à
 * cinq jours ouvrés. Couper au bout de deux, c'est bloquer des clients qui ont payé.
 */
export const GRACE_DAYS = 7

/**
 * Statut effectif à une date donnée.
 *
 * Fonction PURE : elle ne lit pas l'horloge, elle reçoit le jour. C'est ce qui permet
 * de tester « le huitième jour » sans attendre huit jours.
 *
 * L'ordre des cas est la règle métier elle-même : une annulation l'emporte sur tout,
 * un essai expiré sans paiement bascule en impayé, un impayé hors grâce passe en
 * lecture seule. Jamais de suppression : docs/DOMAIN.md, invariant 10.
 */
export function effectiveStatus(state: SubscriptionState, today: CivilDate): SubscriptionStatus {
  if (state.status === 'cancelled') return 'cancelled'

  // Une résiliation demandée reste ACTIVE jusqu'au terme payé : le client a payé
  // jusque-là, il garde son accès jusque-là.
  if (state.cancelAtPeriodEnd && state.periodEndsOn && civilDaysBetween(today, state.periodEndsOn) < 0) {
    return 'cancelled'
  }

  if (state.status === 'trialing') {
    if (!state.trialEndsOn) return 'trialing'
    return civilDaysBetween(today, state.trialEndsOn) >= 0 ? 'trialing' : 'read_only'
  }

  const overdue = state.periodEndsOn !== null && civilDaysBetween(today, state.periodEndsOn) < 0
  if (!overdue) return 'active'

  const graceEnd = state.graceUntilOn ?? addCivilDays(state.periodEndsOn!, GRACE_DAYS)
  return civilDaysBetween(today, graceEnd) >= 0 ? 'past_due' : 'read_only'
}

/**
 * Une organisation dans cet état peut-elle encore écrire ?
 *
 * `past_due` écrit encore : c'est la période de grâce, et c'est le moment où on veut
 * que le client continue à travailler — donc à voir le bandeau qui lui dit de payer.
 */
export function allowsBusinessWrites(status: SubscriptionStatus): boolean {
  return status === 'trialing' || status === 'active' || status === 'past_due'
}
