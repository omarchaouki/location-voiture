import {
  isPlausibleJump,
  signedDistanceToCircleM,
  signedDistanceToPolygonM,
  type LatLng,
} from './geo'

/**
 * Entrées et sorties de zone.
 *
 * Module PUR, comme le moteur d'alertes : il reçoit un état de départ et une suite
 * de positions, il renvoie des transitions et l'état d'arrivée. Rejouer la même
 * entrée donne exactement la même sortie — c'est ce qui rend l'ingestion idempotente
 * et le test possible à horodatages figés.
 *
 * Deux règles portent tout le reste, et aucune n'est cosmétique :
 *
 *  1. **Hystérésis.** On ne franchit pas une limite en la touchant : il faut la
 *     dépasser de `HYSTERESIS_M`. Un traceur à l'arrêt sur le trottoir d'en face
 *     oscille de dix à vingt mètres à chaque relevé ; sans marge, il produirait une
 *     alerte de sortie toutes les trente secondes, toute la nuit.
 *  2. **Aucun événement sur la première observation.** Un véhicule dont on ignore
 *     l'état précédent n'entre ni ne sort : il est simplement quelque part. Sans
 *     cette règle, dessiner une nouvelle zone ferait « sortir » d'un coup toute la
 *     flotte qui est ailleurs, et le gérant recevrait quarante alertes pour un
 *     geste d'interface.
 */

export type GeofenceKind = 'circle' | 'polygon'

export interface GeofenceShape {
  readonly id: string
  readonly kind: GeofenceKind
  /** Cercle : centre et rayon. */
  readonly center?: LatLng
  readonly radiusM?: number
  /** Polygone : anneau extérieur, non refermé (le dernier point rejoint le premier). */
  readonly ring?: ReadonlyArray<LatLng>
  /** all | vehicle | category — à qui la zone s'applique. */
  readonly appliesTo: string
  readonly appliesToValue: string | null
}

export interface TrackPoint {
  readonly at: string
  readonly point: LatLng
}

export type Presence = 'inside' | 'outside'

export interface GeofenceTransition {
  readonly geofenceId: string
  readonly vehicleId: string
  readonly kind: 'enter' | 'exit'
  readonly occurredAt: string
  /** Position qui a fait basculer l'état, pour remonter à la preuve. */
  readonly positionId: string | null
}

/** Marge de franchissement, en mètres. Voir la règle 1 en tête de fichier. */
export const HYSTERESIS_M = 50

/**
 * Distance signée au bord d'une zone : négative dedans, positive dehors.
 * `undefined` si la géométrie est inexploitable — on ne devine pas.
 */
export function signedDistanceM(shape: GeofenceShape, point: LatLng): number | undefined {
  if (shape.kind === 'circle') {
    if (!shape.center || typeof shape.radiusM !== 'number') return undefined
    return signedDistanceToCircleM(point, shape.center, shape.radiusM)
  }
  if (!shape.ring || shape.ring.length < 3) return undefined
  return signedDistanceToPolygonM(point, shape.ring)
}

/** La zone couvre-t-elle ce véhicule ? */
export function appliesToVehicle(
  shape: GeofenceShape,
  vehicle: { id: string; category: string | null },
): boolean {
  if (shape.appliesTo === 'all') return true
  if (shape.appliesTo === 'vehicle') return shape.appliesToValue === vehicle.id
  if (shape.appliesTo === 'category') return shape.appliesToValue === vehicle.category
  // Un critère inconnu ne s'applique à personne : mieux vaut une zone muette
  // qu'une zone qui alerte sur toute la flotte parce qu'on a mal lu une colonne.
  return false
}

export interface EvaluateInput {
  readonly vehicleId: string
  readonly shapes: ReadonlyArray<GeofenceShape>
  /** Positions du véhicule, en ordre CHRONOLOGIQUE. */
  readonly track: ReadonlyArray<TrackPoint & { id: string | null }>
  /** Dernier état connu par zone. Une zone absente = état inconnu. */
  readonly previous: Readonly<Record<string, Presence>>
  readonly hysteresisM?: number
}

export interface EvaluateResult {
  readonly transitions: ReadonlyArray<GeofenceTransition>
  /** État d'arrivée par zone — à réinjecter au prochain passage. */
  readonly states: Record<string, Presence>
}

export function evaluateGeofences(input: EvaluateInput): EvaluateResult {
  const margin = input.hysteresisM ?? HYSTERESIS_M
  const states: Record<string, Presence> = { ...input.previous }
  const transitions: GeofenceTransition[] = []

  // Les positions aberrantes sont écartées AVANT toute décision de zone : une seule
  // suffit à faire sortir puis rentrer un véhicule qui n'a pas bougé.
  const track = keepPlausible(input.track)

  for (const shape of input.shapes) {
    for (const step of track) {
      const distance = signedDistanceM(shape, step.point)
      if (distance === undefined) break

      const known = states[shape.id]

      if (known === undefined) {
        // Première observation : on prend acte, on n'alerte pas.
        states[shape.id] = distance < 0 ? 'inside' : 'outside'
        continue
      }

      if (known === 'inside' && distance > margin) {
        states[shape.id] = 'outside'
        transitions.push({
          geofenceId: shape.id,
          vehicleId: input.vehicleId,
          kind: 'exit',
          occurredAt: step.at,
          positionId: step.id,
        })
        continue
      }

      if (known === 'outside' && distance < -margin) {
        states[shape.id] = 'inside'
        transitions.push({
          geofenceId: shape.id,
          vehicleId: input.vehicleId,
          kind: 'enter',
          occurredAt: step.at,
          positionId: step.id,
        })
      }
    }
  }

  return { transitions, states }
}

/** Écarte les positions dont le saut depuis la précédente est physiquement impossible. */
export function keepPlausible<T extends TrackPoint>(track: ReadonlyArray<T>): T[] {
  const kept: T[] = []
  for (const step of track) {
    const last = kept[kept.length - 1]
    if (last && !isPlausibleJump({ at: last.at, point: last.point }, { at: step.at, point: step.point })) {
      continue
    }
    kept.push(step)
  }
  return kept
}
