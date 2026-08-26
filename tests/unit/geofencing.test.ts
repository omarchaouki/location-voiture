import { describe, expect, it } from 'vitest'

import { appliesToVehicle, evaluateGeofences, HYSTERESIS_M, type GeofenceShape } from '~/core/geofencing'

/**
 * Entrées et sorties de zone.
 *
 * Tous les horodatages sont FIGÉS : la détection ne consulte jamais l'horloge, et
 * rejouer la même trace doit donner exactement les mêmes transitions.
 */

const AGENCY = { lat: 33.5945, lng: -7.6167 }

const zone: GeofenceShape = {
  id: 'z1',
  kind: 'circle',
  center: AGENCY,
  radiusM: 500,
  appliesTo: 'all',
  appliesToValue: null,
}

/** Point à `meters` mètres au nord de l'agence. 1° de latitude ≈ 111 320 m. */
function north(meters: number) {
  return { lat: AGENCY.lat + meters / 111_320, lng: AGENCY.lng }
}

function step(at: string, meters: number, id: string | null = null) {
  return { id, at, point: north(meters) }
}

describe('première observation', () => {
  it('n’émet RIEN quand l’état précédent est inconnu', () => {
    const result = evaluateGeofences({
      vehicleId: 'v1',
      shapes: [zone],
      track: [step('2026-08-24T08:00:00.000Z', 5_000)],
      previous: {},
    })

    // Le véhicule est loin de la zone, mais il n'en est pas « sorti » : il y a
    // toujours été. Sans cette règle, dessiner une zone ferait sortir toute la flotte.
    expect(result.transitions).toEqual([])
    expect(result.states['z1']).toBe('outside')
  })
})

describe('franchissement', () => {
  it('constate une sortie quand la limite est dépassée franchement', () => {
    const result = evaluateGeofences({
      vehicleId: 'v1',
      shapes: [zone],
      track: [step('2026-08-24T08:00:00.000Z', 2_000, 'p1')],
      previous: { z1: 'inside' },
    })

    expect(result.transitions).toEqual([
      {
        geofenceId: 'z1',
        vehicleId: 'v1',
        kind: 'exit',
        occurredAt: '2026-08-24T08:00:00.000Z',
        positionId: 'p1',
      },
    ])
    expect(result.states['z1']).toBe('outside')
  })

  it('constate une entrée dans l’autre sens', () => {
    const result = evaluateGeofences({
      vehicleId: 'v1',
      shapes: [zone],
      track: [step('2026-08-24T09:00:00.000Z', 100)],
      previous: { z1: 'outside' },
    })

    expect(result.transitions.map((transition) => transition.kind)).toEqual(['enter'])
  })

  it('date la transition sur la position qui a fait basculer, pas sur la dernière', () => {
    const result = evaluateGeofences({
      vehicleId: 'v1',
      shapes: [zone],
      track: [
        step('2026-08-24T08:00:00.000Z', 400),
        step('2026-08-24T08:02:00.000Z', 900), // c'est ici que ça bascule
        step('2026-08-24T08:04:00.000Z', 1_500),
      ],
      previous: { z1: 'inside' },
    })

    expect(result.transitions).toHaveLength(1)
    expect(result.transitions[0]?.occurredAt).toBe('2026-08-24T08:02:00.000Z')
  })
})

describe('hystérésis', () => {
  /**
   * LE test qui justifie tout le reste : une voiture garée sur la limite d'une zone
   * oscille de quelques mètres à chaque relevé. Sans marge, elle produirait une
   * alerte toutes les deux minutes, toute la nuit.
   */
  it('ne bascule pas sur une oscillation de quelques mètres autour de la limite', () => {
    const wobble = [495, 505, 498, 510, 502, 507, 499].map((meters, index) =>
      step(`2026-08-24T0${index}:30:00.000Z`, meters),
    )

    const result = evaluateGeofences({
      vehicleId: 'v1',
      shapes: [zone],
      track: wobble,
      previous: { z1: 'inside' },
    })

    expect(result.transitions).toEqual([])
    expect(result.states['z1']).toBe('inside')
  })

  it('bascule dès que la marge est franchie', () => {
    const result = evaluateGeofences({
      vehicleId: 'v1',
      shapes: [zone],
      track: [step('2026-08-24T08:00:00.000Z', 500 + HYSTERESIS_M + 10)],
      previous: { z1: 'inside' },
    })

    expect(result.transitions).toHaveLength(1)
  })
})

describe('positions aberrantes', () => {
  it('n’émet pas de sortie pour un point impossible glissé dans la trace', () => {
    const result = evaluateGeofences({
      vehicleId: 'v1',
      shapes: [zone],
      track: [
        step('2026-08-24T08:00:00.000Z', 100),
        // 400 km au nord en deux minutes : le boîtier a menti.
        { id: null, at: '2026-08-24T08:02:00.000Z', point: { lat: 37.2, lng: -7.6167 } },
        step('2026-08-24T08:04:00.000Z', 120),
      ],
      previous: { z1: 'inside' },
    })

    expect(result.transitions).toEqual([])
  })
})

describe('rejouabilité', () => {
  it('deux évaluations de la même trace donnent le même résultat', () => {
    const input = {
      vehicleId: 'v1',
      shapes: [zone],
      track: [step('2026-08-24T08:00:00.000Z', 2_000), step('2026-08-24T08:10:00.000Z', 100)],
      previous: { z1: 'inside' as const },
    }

    expect(evaluateGeofences(input)).toEqual(evaluateGeofences(input))
  })

  it('repartir de l’état d’arrivée n’émet plus rien', () => {
    const first = evaluateGeofences({
      vehicleId: 'v1',
      shapes: [zone],
      track: [step('2026-08-24T08:00:00.000Z', 2_000)],
      previous: { z1: 'inside' },
    })

    const second = evaluateGeofences({
      vehicleId: 'v1',
      shapes: [zone],
      track: [step('2026-08-24T08:00:00.000Z', 2_000)],
      previous: first.states,
    })

    expect(second.transitions).toEqual([])
  })
})

describe('portée d’une zone', () => {
  const vehicle = { id: 'v1', category: 'berline' }

  it('couvre tout le monde, un véhicule précis, ou une catégorie', () => {
    expect(appliesToVehicle({ ...zone, appliesTo: 'all' }, vehicle)).toBe(true)
    expect(
      appliesToVehicle({ ...zone, appliesTo: 'vehicle', appliesToValue: 'v1' }, vehicle),
    ).toBe(true)
    expect(
      appliesToVehicle({ ...zone, appliesTo: 'vehicle', appliesToValue: 'v2' }, vehicle),
    ).toBe(false)
    expect(
      appliesToVehicle({ ...zone, appliesTo: 'category', appliesToValue: 'berline' }, vehicle),
    ).toBe(true)
  })

  it('ne s’applique à personne quand le critère est inconnu', () => {
    // Mieux vaut une zone muette qu'une zone qui alerte sur toute la flotte.
    expect(appliesToVehicle({ ...zone, appliesTo: 'inconnu' }, vehicle)).toBe(false)
  })
})
