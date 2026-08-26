import { describe, expect, it } from 'vitest'

import {
  boundsOf,
  isInsideCircle,
  isInsidePolygon,
  isPlausibleJump,
  metersBetween,
  pathLengthMeters,
  signedDistanceToCircleM,
  signedDistanceToPolygonM,
} from '~/core/geo'

/**
 * Géométrie de terrain.
 *
 * Les distances de référence sont des distances RÉELLES entre points connus du
 * Maroc, pas des valeurs recopiées depuis la sortie du code. Un test qui vérifie que
 * la fonction fait ce qu'elle fait ne vérifie rien.
 */

const CASA_UN = { lat: 33.5945, lng: -7.6167 } // Place des Nations Unies
const CASA_TWIN = { lat: 33.5731, lng: -7.6631 } // Twin Center, ~4,8 km au sud-ouest
const RABAT = { lat: 34.0209, lng: -6.8416 }

describe('distance', () => {
  it('mesure une distance urbaine à quelques dizaines de mètres près', () => {
    const meters = metersBetween(CASA_UN, CASA_TWIN)
    expect(meters).toBeGreaterThan(4_500)
    expect(meters).toBeLessThan(5_200)
  })

  it('mesure Casablanca — Rabat autour de 87 km', () => {
    const km = metersBetween(CASA_UN, RABAT) / 1000
    expect(km).toBeGreaterThan(84)
    expect(km).toBeLessThan(90)
  })

  it('est symétrique et nulle sur place', () => {
    expect(metersBetween(CASA_UN, CASA_UN)).toBe(0)
    expect(metersBetween(CASA_UN, RABAT)).toBeCloseTo(metersBetween(RABAT, CASA_UN), 6)
  })

  it('somme une trace', () => {
    const total = pathLengthMeters([CASA_UN, CASA_TWIN, CASA_UN])
    expect(total).toBeCloseTo(2 * metersBetween(CASA_UN, CASA_TWIN), 3)
  })
})

describe('appartenance', () => {
  it('place un point dans un cercle, et pas un point voisin', () => {
    expect(isInsideCircle(CASA_UN, CASA_UN, 100)).toBe(true)
    expect(isInsideCircle(CASA_TWIN, CASA_UN, 1_000)).toBe(false)
    expect(isInsideCircle(CASA_TWIN, CASA_UN, 6_000)).toBe(true)
  })

  /** Un carré d'environ 2 km de côté autour du centre de Casablanca. */
  const square = [
    { lat: 33.585, lng: -7.63 },
    { lat: 33.585, lng: -7.6 },
    { lat: 33.605, lng: -7.6 },
    { lat: 33.605, lng: -7.63 },
  ]

  it('place un point dans un polygone', () => {
    expect(isInsidePolygon(CASA_UN, square)).toBe(true)
    expect(isInsidePolygon(RABAT, square)).toBe(false)
  })

  it('refuse un anneau dégénéré au lieu de deviner', () => {
    expect(isInsidePolygon(CASA_UN, [CASA_UN, RABAT])).toBe(false)
    expect(signedDistanceToPolygonM(CASA_UN, [])).toBe(Number.POSITIVE_INFINITY)
  })

  it('donne une distance NÉGATIVE à l’intérieur — ce qui rend l’hystérésis possible', () => {
    expect(signedDistanceToPolygonM(CASA_UN, square)).toBeLessThan(0)
    expect(signedDistanceToPolygonM(RABAT, square)).toBeGreaterThan(0)
    expect(signedDistanceToCircleM(CASA_UN, CASA_UN, 300)).toBe(-300)
  })

  it('mesure la distance au BORD, pas au centre', () => {
    // Un point à ~4,8 km du centre d'un cercle de 1 km est à ~3,8 km de son bord.
    const distance = signedDistanceToCircleM(CASA_TWIN, CASA_UN, 1_000)
    expect(distance).toBeGreaterThan(3_500)
    expect(distance).toBeLessThan(4_200)
  })
})

describe('cadre', () => {
  it('n’invente pas un cadre à (0, 0) quand il n’y a rien', () => {
    expect(boundsOf([])).toBeUndefined()
  })

  it('englobe tous les points', () => {
    const bounds = boundsOf([CASA_UN, RABAT, CASA_TWIN])
    expect(bounds).toEqual({
      south: CASA_TWIN.lat,
      west: CASA_TWIN.lng,
      north: RABAT.lat,
      east: RABAT.lng,
    })
  })
})

describe('positions aberrantes', () => {
  it('refuse un saut Casablanca → Rabat en une minute', () => {
    expect(
      isPlausibleJump(
        { at: '2026-08-24T10:00:00.000Z', point: CASA_UN },
        { at: '2026-08-24T10:01:00.000Z', point: RABAT },
      ),
    ).toBe(false)
  })

  it('accepte le même trajet en une heure', () => {
    expect(
      isPlausibleJump(
        { at: '2026-08-24T10:00:00.000Z', point: CASA_UN },
        { at: '2026-08-24T11:00:00.000Z', point: RABAT },
      ),
    ).toBe(true)
  })

  it('ne conclut rien de deux relevés au même horodatage', () => {
    expect(
      isPlausibleJump(
        { at: '2026-08-24T10:00:00.000Z', point: CASA_UN },
        { at: '2026-08-24T10:00:00.000Z', point: RABAT },
      ),
    ).toBe(true)
  })
})
