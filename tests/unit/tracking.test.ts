import { describe, expect, it } from 'vitest'

import { isRentedAt, odometerDeltaKm, travelledDistance, unauthorizedMovements } from '~/core/tracking'

/** Ce que le GPS dit du métier : les kilomètres, et l'usage hors contrat. */

const AGENCY = { lat: 33.5945, lng: -7.6167 }

/** Point à `meters` mètres au nord de l'agence. */
function north(meters: number) {
  return { lat: AGENCY.lat + meters / 111_320, lng: AGENCY.lng }
}

describe('kilométrage', () => {
  it('somme les déplacements réels', () => {
    const { meters } = travelledDistance([
      { at: '2026-08-24T08:00:00.000Z', point: north(0), speedKmh: 40, odometerKm: null },
      { at: '2026-08-24T08:02:00.000Z', point: north(1_000), speedKmh: 40, odometerKm: null },
      { at: '2026-08-24T08:04:00.000Z', point: north(2_000), speedKmh: 40, odometerKm: null },
    ])

    expect(meters).toBeGreaterThan(1_950)
    expect(meters).toBeLessThan(2_050)
  })

  /**
   * LE test qui protège les échéances de vidange : une voiture garée toute la nuit
   * ne doit pas gagner de kilomètres parce que son boîtier tremble de huit mètres.
   */
  it('n’invente pas de kilomètres pour une voiture à l’arrêt', () => {
    const parked = Array.from({ length: 60 }, (_, index) => ({
      at: new Date(Date.UTC(2026, 7, 24, 2, index)).toISOString(),
      point: north(index % 2 === 0 ? 0 : 8),
      speedKmh: 1,
      odometerKm: null,
    }))

    expect(odometerDeltaKm(parked)).toBe(0)
  })

  it('préfère le compteur du boîtier au cumul des sauts', () => {
    const track = [
      { at: '2026-08-24T08:00:00.000Z', point: north(0), speedKmh: 40, odometerKm: 91_340 },
      { at: '2026-08-24T09:00:00.000Z', point: north(3_000), speedKmh: 40, odometerKm: 91_380 },
    ]

    // Le cumul dirait 3 km ; le boîtier dit 40, et c'est lui qui a raison — il a
    // suivi la route, pas la ligne droite.
    expect(odometerDeltaKm(track)).toBe(40)
  })

  it('écarte une position impossible et le dit', () => {
    const { discarded } = travelledDistance([
      { at: '2026-08-24T08:00:00.000Z', point: north(0), speedKmh: 40, odometerKm: null },
      { at: '2026-08-24T08:01:00.000Z', point: { lat: 37.2, lng: -7.6 }, speedKmh: 40, odometerKm: null },
      { at: '2026-08-24T08:02:00.000Z', point: north(1_000), speedKmh: 40, odometerKm: null },
    ])

    expect(discarded).toBe(1)
  })
})

describe('couverture par un contrat', () => {
  const windows = [
    { startAt: '2026-08-20T09:00:00.000Z', endAt: '2026-08-23T18:00:00.000Z', status: 'returned' },
    { startAt: '2026-08-24T10:00:00.000Z', endAt: null, status: 'active' },
  ]

  it('inclut les bornes', () => {
    expect(isRentedAt('2026-08-20T09:00:00.000Z', windows)).toBe(true)
    expect(isRentedAt('2026-08-23T18:00:00.000Z', windows)).toBe(true)
  })

  it('laisse un contrat ouvert couvrir tout ce qui suit', () => {
    expect(isRentedAt('2026-12-31T23:00:00.000Z', windows)).toBe(true)
  })

  it('ne couvre pas l’intervalle entre deux locations', () => {
    expect(isRentedAt('2026-08-24T08:00:00.000Z', windows)).toBe(false)
  })

  it('ignore un contrat annulé', () => {
    expect(
      isRentedAt('2026-08-25T10:00:00.000Z', [
        { startAt: '2026-08-25T09:00:00.000Z', endAt: null, status: 'cancelled' },
      ]),
    ).toBe(false)
  })
})

describe('usage hors contrat', () => {
  const rented = [{ startAt: '2026-08-24T10:00:00.000Z', endAt: null, status: 'active' }]

  it('ne dit rien d’une voiture qui roule sous contrat', () => {
    expect(
      unauthorizedMovements(
        [{ at: '2026-08-24T11:00:00.000Z', onDay: '2026-08-24', speedKmh: 60 }],
        rented,
      ),
    ).toEqual([])
  })

  it('signale un mouvement sans contrat', () => {
    const found = unauthorizedMovements(
      [{ at: '2026-08-24T06:00:00.000Z', onDay: '2026-08-24', speedKmh: 60 }],
      rented,
    )
    expect(found).toHaveLength(1)
    expect(found[0]?.at).toBe('2026-08-24T06:00:00.000Z')
  })

  it('ignore la dérive d’un traceur immobile', () => {
    expect(
      unauthorizedMovements(
        [{ at: '2026-08-24T03:00:00.000Z', onDay: '2026-08-24', speedKmh: 2 }],
        [],
      ),
    ).toEqual([])
  })

  /** Une voiture, un jour, une alerte : le détail reste dans `gps_positions`. */
  it('ne retient qu’un relevé par jour, le PREMIER', () => {
    const found = unauthorizedMovements(
      [
        { at: '2026-08-24T09:00:00.000Z', onDay: '2026-08-24', speedKmh: 50 },
        { at: '2026-08-24T06:30:00.000Z', onDay: '2026-08-24', speedKmh: 50 },
        { at: '2026-08-24T07:00:00.000Z', onDay: '2026-08-24', speedKmh: 50 },
        { at: '2026-08-25T07:00:00.000Z', onDay: '2026-08-25', speedKmh: 50 },
      ],
      [],
    )

    expect(found.map((movement) => movement.onDay)).toEqual(['2026-08-24', '2026-08-25'])
    expect(found[0]?.at).toBe('2026-08-24T06:30:00.000Z')
  })
})
