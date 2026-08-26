import { civilDateOfIso, civilDaysBetween, type CivilDate } from './dates'

/**
 * RÈGLES DE LOCATION — module pur.
 *
 * Tarification, chevauchement, transitions d'état et blocages à la signature. Ni
 * React, ni Drizzle, ni horloge : ce qui décide combien un client paie et si un
 * contrat peut être signé doit être testable à froid, ligne à ligne.
 */

/* --------------------------------------------------------------- tarification */

export interface PricingInput {
  /** Instants ISO UTC. */
  startAt: string
  endAt: string
  dailyCents: number
  discountCents?: number
  extrasCents?: number
  /** TVA en points de base : 2000 = 20 %. Entier, jamais 0,20. */
  vatRateBp?: number
}

export interface Pricing {
  daysBilled: number
  subtotalCents: number
  vatCents: number
  totalCents: number
}

/** TVA marocaine par défaut. À confirmer par un comptable avant la Phase 9. */
export const DEFAULT_VAT_RATE_BP = 2000

/**
 * Jours facturés.
 *
 * Un loueur facture des JOURS ENTAMÉS, pas des heures : une location de 24 h et
 * 10 minutes se facture deux jours. C'est l'usage du métier, et le contraire
 * surprendrait le gérant comme le client. Une location du matin au soir compte
 * pour un jour, jamais zéro.
 */
export function billableDays(startAt: string, endAt: string): number {
  const start = Date.parse(startAt)
  const end = Date.parse(endAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1
  return Math.max(1, Math.ceil((end - start) / 86_400_000))
}

/**
 * Calcul du prix.
 *
 * Tout est en centimes entiers, de bout en bout. La TVA est arrondie une seule fois,
 * à la fin — arrondir à chaque ligne ferait dériver le total de quelques centimes,
 * ce qui se voit sur une facture.
 */
export function priceRental(input: PricingInput): Pricing {
  const daysBilled = billableDays(input.startAt, input.endAt)
  const discount = input.discountCents ?? 0
  const extras = input.extrasCents ?? 0
  const vatRateBp = input.vatRateBp ?? DEFAULT_VAT_RATE_BP

  const gross = daysBilled * input.dailyCents + extras
  const subtotalCents = Math.max(0, gross - discount)
  const vatCents = Math.round((subtotalCents * vatRateBp) / 10_000)

  return {
    daysBilled,
    subtotalCents,
    vatCents,
    totalCents: subtotalCents + vatCents,
  }
}

/* -------------------------------------------------------------- chevauchement */

export interface Reservation {
  id: string
  startAt: string
  endAt: string
  /** Un contrat annulé ou clos ne bloque plus le véhicule. */
  blocking: boolean
}

/**
 * Un véhicule ne peut pas être loué deux fois en même temps (invariant 3).
 *
 * Deux périodes se chevauchent si chacune commence avant que l'autre ne finisse.
 * Le contact bord à bord est autorisé : un retour à 18h et un départ à 18h le même
 * jour, c'est une rotation normale, pas un conflit.
 */
export function findOverlap(
  candidate: { startAt: string; endAt: string; excludeId?: string },
  existing: ReadonlyArray<Reservation>,
): Reservation | null {
  const start = Date.parse(candidate.startAt)
  const end = Date.parse(candidate.endAt)

  return (
    existing.find((reservation) => {
      if (!reservation.blocking) return false
      if (candidate.excludeId && reservation.id === candidate.excludeId) return false
      return Date.parse(reservation.startAt) < end && start < Date.parse(reservation.endAt)
    }) ?? null
  )
}

/* ------------------------------------------------------------ états du contrat */

export type ContractStatus = 'reservation' | 'active' | 'returned' | 'late' | 'cancelled'

const TRANSITIONS: Record<ContractStatus, ReadonlyArray<ContractStatus>> = {
  reservation: ['active', 'cancelled'],
  // `late` n'est jamais saisi : c'est le moteur d'alertes qui le constate.
  active: ['returned', 'late', 'cancelled'],
  late: ['returned'],
  returned: [],
  cancelled: [],
}

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: ContractStatus,
    readonly to: ContractStatus,
  ) {
    super(`invalid contract transition: ${from} -> ${to}`)
    this.name = 'InvalidTransitionError'
  }
}

export function assertTransition(from: ContractStatus, to: ContractStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to)
}

/* -------------------------------------------------- blocages à la signature */

export type SignatureBlock =
  | { reason: 'licence_expired'; expiresOn: CivilDate }
  | { reason: 'licence_missing' }
  | { reason: 'blacklisted'; note: string | null }
  | { reason: 'vehicle_unavailable'; status: string }
  | { reason: 'vehicle_overlap'; contractId: string }

export interface SignatureCheckInput {
  today: CivilDate
  customer: {
    licenceExpiresOn: CivilDate | null
    isBlacklisted: boolean
    blacklistReason: string | null
    kind: string
  }
  vehicle: { status: string }
  overlap: Reservation | null
}

/**
 * Ce qui empêche de signer un contrat (docs/DOMAIN.md §6, invariants 3 à 5).
 *
 * Renvoie TOUS les blocages, pas seulement le premier : un agent au comptoir doit
 * voir d'un coup ce qui cloche, pas les découvrir un par un en réessayant.
 *
 * Le permis expiré est bloquant, avec une dérogation explicite réservée à
 * `owner`/`manager` — décidée ailleurs, tracée dans `audit_log`. Une société n'a pas
 * de permis : c'est son conducteur qui en a un, donc on ne bloque pas là-dessus.
 */
export function checkSignature(input: SignatureCheckInput): SignatureBlock[] {
  const blocks: SignatureBlock[] = []

  if (input.customer.isBlacklisted) {
    blocks.push({ reason: 'blacklisted', note: input.customer.blacklistReason })
  }

  if (input.customer.kind !== 'company') {
    if (!input.customer.licenceExpiresOn) {
      blocks.push({ reason: 'licence_missing' })
    } else if (civilDaysBetween(input.today, input.customer.licenceExpiresOn) < 0) {
      blocks.push({ reason: 'licence_expired', expiresOn: input.customer.licenceExpiresOn })
    }
  }

  if (input.vehicle.status !== 'available' && input.vehicle.status !== 'rented') {
    blocks.push({ reason: 'vehicle_unavailable', status: input.vehicle.status })
  }

  if (input.overlap) {
    blocks.push({ reason: 'vehicle_overlap', contractId: input.overlap.id })
  }

  return blocks
}

/** Seuls ces blocages acceptent une dérogation. Le chevauchement, jamais. */
const OVERRIDABLE: ReadonlySet<SignatureBlock['reason']> = new Set([
  'licence_expired',
  'licence_missing',
  'blacklisted',
])

export function isOverridable(blocks: ReadonlyArray<SignatureBlock>): boolean {
  return blocks.length > 0 && blocks.every((block) => OVERRIDABLE.has(block.reason))
}

/* ------------------------------------------------------------------ référence */

/**
 * Référence de contrat : `AAAA-NNNNNN`, séquence par organisation et par année.
 *
 * Lisible, triable, et remise à zéro chaque année comme sur un carnet à souches.
 */
export function nextReference(year: number, lastReference: string | null): string {
  const prefix = String(year)
  const sequence =
    lastReference && lastReference.startsWith(prefix)
      ? Number.parseInt(lastReference.slice(5), 10) + 1
      : 1
  return `${prefix}-${String(sequence).padStart(6, '0')}`
}

/** Date civile de fin prévue, pour la frise et les alertes. */
export function plannedEndOn(plannedEndAt: string): CivilDate {
  return civilDateOfIso(plannedEndAt)
}
