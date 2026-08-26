/**
 * Géométrie de terrain.
 *
 * Module PUR : ni React, ni Drizzle, ni horloge. Tout est en mètres — jamais en
 * degrés — parce qu'un degré de longitude ne vaut pas la même distance à Tanger
 * (35,8° N) qu'à Dakhla (23,7° N), et que le produit raisonne en « à 300 m de
 * l'agence », jamais en « à 0,003° de l'agence ».
 *
 * Les latitudes/longitudes sont des `real` en base (exception assumée à la charte,
 * voir src/db/schema/gps.ts) : ce sont des mesures physiques, pas de l'argent.
 */

export interface LatLng {
  readonly lat: number
  readonly lng: number
}

/** Rayon moyen de la Terre (sphère WGS84). */
const EARTH_RADIUS_M = 6_371_008.8

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

export function isLatLng(value: unknown): value is LatLng {
  if (typeof value !== 'object' || value === null) return false
  const point = value as { lat?: unknown; lng?: unknown }
  return (
    typeof point.lat === 'number' &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  )
}

/**
 * Distance orthodromique, formule de haversine.
 *
 * Précision largement suffisante ici : l'écart du modèle sphérique face à
 * l'ellipsoïde est de l'ordre de 0,3 %, quand le traceur d'un véhicule annonce déjà
 * 5 à 15 m d'incertitude. Vincenty coûterait dix fois plus cher pour une précision
 * que la donnée d'entrée n'a pas.
 */
export function metersBetween(from: LatLng, to: LatLng): number {
  const deltaLat = toRadians(to.lat - from.lat)
  const deltaLng = toRadians(to.lng - from.lng)
  const fromLat = toRadians(from.lat)
  const toLat = toRadians(to.lat)

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.sin(deltaLng / 2) ** 2 * Math.cos(fromLat) * Math.cos(toLat)

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Longueur d'une trace, somme des sauts successifs. */
export function pathLengthMeters(points: ReadonlyArray<LatLng>): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += metersBetween(points[index - 1]!, points[index]!)
  }
  return total
}

/* -------------------------------------------------------------------------- */
/* Projection locale                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Repère plan local, en mètres, centré sur `origin`.
 *
 * Sur quelques kilomètres — la taille d'une zone utile — la projection
 * équirectangulaire est exacte à mieux que le mètre, et elle rend le calcul de la
 * distance à un segment trivial. C'est ce qui permet d'écrire la distance à un
 * polygone sans embarquer une bibliothèque de géométrie sphérique.
 */
function toLocalMeters(point: LatLng, origin: LatLng): { x: number; y: number } {
  const latitudeScale = Math.cos(toRadians(origin.lat))
  return {
    x: toRadians(point.lng - origin.lng) * EARTH_RADIUS_M * latitudeScale,
    y: toRadians(point.lat - origin.lat) * EARTH_RADIUS_M,
  }
}

/** Distance d'un point au segment [a, b], le tout déjà projeté en mètres. */
function distanceToSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy

  // Segment dégénéré : deux sommets confondus, ça arrive dans un tracé à la souris.
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y)

  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/* -------------------------------------------------------------------------- */
/* Appartenance                                                               */
/* -------------------------------------------------------------------------- */

export function isInsideCircle(point: LatLng, center: LatLng, radiusM: number): boolean {
  return metersBetween(point, center) <= radiusM
}

/**
 * Appartenance à un polygone, par lancer de rayon.
 *
 * Le test de parité ne dépend pas de l'échelle : projeter d'abord ne changerait pas
 * le résultat. Le Maroc ne touche ni l'antiméridien ni un pôle — les deux seuls cas
 * où ce test naïf se trompe.
 */
export function isInsidePolygon(point: LatLng, ring: ReadonlyArray<LatLng>): boolean {
  if (ring.length < 3) return false

  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i]!
    const b = ring[j]!
    const straddles = a.lat > point.lat !== b.lat > point.lat
    if (!straddles) continue

    const crossingLng = ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng
    if (point.lng < crossingLng) inside = !inside
  }
  return inside
}

/* -------------------------------------------------------------------------- */
/* Distance SIGNÉE au bord — ce qui rend l'hystérésis possible                */
/* -------------------------------------------------------------------------- */

/**
 * Distance au bord, **négative à l'intérieur**, positive à l'extérieur.
 *
 * C'est cette valeur, et non un booléen, que consomme la détection d'entrée et de
 * sortie : un traceur immobile posé sur la limite d'une zone oscille de quelques
 * mètres à chaque relevé, et un booléen produirait une alerte toutes les trente
 * secondes, toute la nuit. Voir src/core/geofencing.ts.
 */
export function signedDistanceToCircleM(point: LatLng, center: LatLng, radiusM: number): number {
  return metersBetween(point, center) - radiusM
}

export function signedDistanceToPolygonM(point: LatLng, ring: ReadonlyArray<LatLng>): number {
  if (ring.length < 3) return Number.POSITIVE_INFINITY

  const projectedPoint = toLocalMeters(point, point)
  let closest = Number.POSITIVE_INFINITY
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const distance = distanceToSegment(
      projectedPoint,
      toLocalMeters(ring[j]!, point),
      toLocalMeters(ring[i]!, point),
    )
    if (distance < closest) closest = distance
  }

  return isInsidePolygon(point, ring) ? -closest : closest
}

/* -------------------------------------------------------------------------- */
/* Cadre                                                                      */
/* -------------------------------------------------------------------------- */

export interface Bounds {
  readonly south: number
  readonly west: number
  readonly north: number
  readonly east: number
}

/** Cadre englobant. `undefined` si la liste est vide — pas un cadre à (0, 0). */
export function boundsOf(points: ReadonlyArray<LatLng>): Bounds | undefined {
  if (points.length === 0) return undefined

  let south = Number.POSITIVE_INFINITY
  let west = Number.POSITIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY

  for (const point of points) {
    if (point.lat < south) south = point.lat
    if (point.lat > north) north = point.lat
    if (point.lng < west) west = point.lng
    if (point.lng > east) east = point.lng
  }

  return { south, west, north, east }
}

/**
 * Cercle → anneau de points.
 *
 * Une carte ne sait pas dessiner « 500 mètres » : elle dessine des polygones. La
 * conversion se fait ICI, dans le module pur, et non dans le composant — c'est de la
 * géométrie, et le facteur `cos(latitude)` sur la longitude est exactement le genre
 * d'oubli qui donne un cercle aplati sans qu'on comprenne pourquoi.
 */
export function circleToRing(center: LatLng, radiusM: number, steps = 64): LatLng[] {
  const latitudeDegrees = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI)
  const longitudeDegrees = latitudeDegrees / Math.cos(toRadians(center.lat))

  return Array.from({ length: steps }, (_, index) => {
    const angle = (2 * Math.PI * index) / steps
    return {
      lat: center.lat + latitudeDegrees * Math.cos(angle),
      lng: center.lng + longitudeDegrees * Math.sin(angle),
    }
  })
}

/**
 * Un saut est-il physiquement plausible ?
 *
 * Un traceur bon marché envoie de temps en temps une position aberrante — souvent
 * `(0, 0)`, parfois un point à mille kilomètres. Intégrée telle quelle, une seule de
 * ces positions ajoute des milliers de kilomètres au compteur du véhicule et
 * déclenche une fausse sortie de zone. On la refuse par la vitesse qu'elle implique.
 */
export const MAX_PLAUSIBLE_KMH = 220

export function isPlausibleJump(
  from: { at: string; point: LatLng },
  to: { at: string; point: LatLng },
  maxKmh: number = MAX_PLAUSIBLE_KMH,
): boolean {
  const seconds = (Date.parse(to.at) - Date.parse(from.at)) / 1000
  // Deux relevés au même horodatage : rien à conclure, on ne rejette pas.
  if (!Number.isFinite(seconds) || seconds <= 0) return true

  const kmh = (metersBetween(from.point, to.point) / seconds) * 3.6
  return kmh <= maxKmh
}
