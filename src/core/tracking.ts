import { HELD_STATUSES } from './fines'
import { keepPlausible } from './geofencing'
import { metersBetween, type LatLng } from './geo'

/**
 * Ce que le GPS dit du métier.
 *
 * Module PUR. Le GPS n'est pas une fin : il ne sert qu'à répondre à deux questions
 * qu'un gérant se pose vraiment.
 *
 *  1. **Combien de kilomètres cette voiture a-t-elle faits ?** C'est le seul chemin
 *     par lequel le GPS alimente le métier : `vehicles.current_km`, donc les
 *     échéances de vidange (docs/DOMAIN.md §4.8).
 *  2. **Roule-t-elle alors que personne ne l'a louée ?** Un véhicule en mouvement
 *     sans contrat actif, c'est au mieux un déplacement interne non saisi, au pire
 *     un usage privé de la voiture d'un client.
 */

/**
 * Au-dessous de ce seuil, on considère que le véhicule est à l'arrêt.
 *
 * 5 km/h et non 0 : un traceur immobile renvoie en permanence des vitesses de 1 à
 * 3 km/h (dérive du calcul Doppler). À 0, chaque voiture garée « roulerait » toute
 * la nuit et l'alerte d'usage hors contrat serait un générateur de bruit.
 */
export const MOVING_KMH = 5

export interface TrackStep {
  readonly at: string
  readonly point: LatLng
  readonly speedKmh: number | null
  readonly odometerKm: number | null
}

/* -------------------------------------------------------------- kilométrage */

export interface DistanceResult {
  readonly meters: number
  /** Compteur du traceur, s'il en publie un — toujours préféré au cumul. */
  readonly odometerKm: number | null
  /** Positions écartées comme physiquement impossibles. */
  readonly discarded: number
}

/**
 * Distance parcourue sur une trace.
 *
 * Le compteur du boîtier, quand il existe, l'emporte sur le cumul des sauts : le
 * cumul SURESTIME toujours, parce que le bruit de mesure s'ajoute à chaque relevé
 * au lieu de se compenser. Sur une voiture garée pendant une nuit avec un relevé
 * toutes les deux minutes, un bruit de 8 m produit 2 à 3 km fantômes.
 */
export function travelledDistance(track: ReadonlyArray<TrackStep>): DistanceResult {
  const kept = keepPlausible(track)

  let meters = 0
  for (let index = 1; index < kept.length; index += 1) {
    const previous = kept[index - 1]!
    const current = kept[index]!
    // Un saut entre deux relevés à l'arrêt est du bruit, pas un déplacement.
    if (isStopped(previous) && isStopped(current)) continue
    meters += metersBetween(previous.point, current.point)
  }

  const odometers = kept
    .map((step) => step.odometerKm)
    .filter((value): value is number => typeof value === 'number' && value > 0)

  const odometerKm =
    odometers.length >= 2 ? Math.max(...odometers) - Math.min(...odometers) : null

  return { meters, odometerKm, discarded: track.length - kept.length }
}

function isStopped(step: TrackStep): boolean {
  return step.speedKmh !== null && step.speedKmh < MOVING_KMH
}

/**
 * Kilomètres à ajouter au compteur du véhicule.
 *
 * Renvoie un ENTIER : `vehicles.current_km` est un entier, et un compteur de
 * voiture n'a jamais affiché de décimale.
 */
export function odometerDeltaKm(track: ReadonlyArray<TrackStep>): number {
  const { meters, odometerKm } = travelledDistance(track)
  return Math.max(0, Math.round(odometerKm ?? meters / 1000))
}

/* ------------------------------------------------------- usage hors contrat */

export interface RentalWindow {
  readonly startAt: string
  readonly endAt: string | null
  readonly status: string
}

/**
 * La voiture était-elle chez un client à cet instant ?
 *
 * Même sémantique de bornes que `attachFine` — inclusives, contrat ouvert couvrant
 * tout ce qui suit son départ — et la même liste de statuts, importée et non
 * recopiée. La question est en revanche différente : ici on ne cherche PAS quel
 * contrat, seulement s'il y en a un. Un chevauchement, qui rend `attachFine`
 * ambigu, laisse celle-ci parfaitement sûre d'elle.
 */
export function isRentedAt(instant: string, windows: ReadonlyArray<RentalWindow>): boolean {
  const at = Date.parse(instant)
  if (!Number.isFinite(at)) return false

  return windows.some((window) => {
    if (!HELD_STATUSES.has(window.status)) return false
    const start = Date.parse(window.startAt)
    if (!Number.isFinite(start) || at < start) return false
    if (window.endAt === null) return true
    const end = Date.parse(window.endAt)
    return Number.isFinite(end) && at <= end
  })
}

export interface MovementSample {
  readonly at: string
  /** Jour civil À CASABLANCA, calculé au bord — le module pur ne connaît pas de fuseau. */
  readonly onDay: string
  readonly speedKmh: number
}

/**
 * Premier mouvement non couvert par un contrat, par jour civil.
 *
 * Un seul échantillon par jour : le but est de dire « cette voiture a roulé hors
 * contrat ce jour-là », pas de tenir le journal des trois cents relevés qui le
 * prouvent. Le détail reste dans `gps_positions`, qui est fait pour ça.
 */
export function unauthorizedMovements(
  samples: ReadonlyArray<MovementSample>,
  windows: ReadonlyArray<RentalWindow>,
): MovementSample[] {
  const firstOfDay = new Map<string, MovementSample>()

  for (const sample of samples) {
    if (sample.speedKmh < MOVING_KMH) continue
    if (isRentedAt(sample.at, windows)) continue
    const known = firstOfDay.get(sample.onDay)
    if (!known || Date.parse(sample.at) < Date.parse(known.at)) {
      firstOfDay.set(sample.onDay, sample)
    }
  }

  return [...firstOfDay.values()].sort((a, b) => a.onDay.localeCompare(b.onDay))
}
