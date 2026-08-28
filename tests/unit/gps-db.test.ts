import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '~/db/client'
import {
  geofenceEventRepository,
  geofenceRepository,
  gpsDeviceRepository,
  gpsPositionRepository,
  vehicleDailyKmRepository,
} from '~/db/repositories/gps'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { createMockProvider } from '~/server/gps/mock'
import type { GpsProvider, ProviderPosition } from '~/server/gps/provider'
import { purgeGpsPositions } from '~/server/gps/retention'
import { syncGpsPositions } from '~/server/gps/sync'
import { createTestDb, tenant } from '../helpers/db'

/**
 * INGESTION GPS, contre une vraie base.
 *
 * Ce que ce fichier prouve, et qu'aucun test pur ne peut prouver : que rejouer une
 * synchronisation ne crée rien, que le compteur d'un véhicule ne double pas, et
 * qu'une position d'un client reste invisible pour l'autre.
 */

const ALPHA = tenant('org-alpha')
const BRAVO = tenant('org-bravo')

const AGENCY = { lat: 33.5945, lng: -7.6167 }
const NOW = new Date('2026-08-24T12:00:00.000Z')

let db: Db

beforeEach(async () => {
  db = await createTestDb()
  plateCounter = 0
})

let plateCounter = 0

async function equippedVehicle(ctx = ALPHA, externalId = 'IMEI-0001') {
  plateCounter += 1
  const vehicle = await vehicleRepository(db, ctx).create({
    plate: `1234${plateCounter} | أ | 6`,
    make: 'Dacia',
    model: 'Logan',
    currentKm: 91_340,
  })
  const device = await gpsDeviceRepository(db, ctx).insert({
    vehicleId: vehicle.id,
    provider: 'mock',
    externalId,
    isActive: true,
  })
  return { vehicle, device }
}

/** Fournisseur à trace imposée : on contrôle exactement ce qui entre. */
function scriptedProvider(points: ProviderPosition[]): GpsProvider {
  return {
    name: 'mock',
    listDevices: () => Promise.resolve([]),
    fetchPositions: ({ from, to }) =>
      Promise.resolve(
        points.filter((point) => point.recordedAt > from && point.recordedAt <= to),
      ),
  }
}

function at(minutes: number, meters: number, speedKmh = 50): ProviderPosition {
  return {
    externalDeviceId: 'IMEI-0001',
    recordedAt: new Date(NOW.getTime() - (120 - minutes) * 60_000).toISOString(),
    lat: AGENCY.lat + meters / 111_320,
    lng: AGENCY.lng,
    speedKmh,
    heading: 0,
    ignition: true,
    odometerKm: null,
    raw: {},
  }
}

describe('idempotence de l’ingestion', () => {
  it('rejouer la même fenêtre ne crée aucune position', async () => {
    await equippedVehicle()
    const provider = createMockProvider()

    const first = await syncGpsPositions(db, ALPHA, provider, NOW)
    expect(first.inserted).toBeGreaterThan(0)

    // Même instant de référence, donc même fenêtre, donc rien de neuf.
    const second = await syncGpsPositions(db, ALPHA, provider, NOW)
    expect(second.inserted).toBe(0)

    const third = await syncGpsPositions(db, ALPHA, provider, NOW)
    expect(third.inserted).toBe(0)
  })

  it('le fournisseur simulé renvoie deux fois la même trace', async () => {
    const provider = createMockProvider()
    const window = { externalDeviceId: 'IMEI-0001', from: '2026-08-24T08:00:00.000Z', to: '2026-08-24T09:00:00.000Z' }

    expect(await provider.fetchPositions(window)).toEqual(await provider.fetchPositions(window))
  })
})

describe('cloisonnement', () => {
  it('une position d’Alpha est invisible pour Bravo', async () => {
    await equippedVehicle(ALPHA, 'IMEI-ALPHA')
    await equippedVehicle(BRAVO, 'IMEI-BRAVO')

    await syncGpsPositions(db, ALPHA, createMockProvider(), NOW)

    const since = '2026-08-23T00:00:00.000Z'
    expect((await gpsPositionRepository(db, ALPHA).since(since)).length).toBeGreaterThan(0)
    expect(await gpsPositionRepository(db, BRAVO).since(since)).toHaveLength(0)
  })

  it('deux organisations peuvent déclarer le MÊME identifiant de boîtier', async () => {
    await equippedVehicle(ALPHA, 'IMEI-PARTAGE')
    await expect(equippedVehicle(BRAVO, 'IMEI-PARTAGE')).resolves.toBeDefined()

    const found = await gpsDeviceRepository(db, BRAVO).findByExternalId('IMEI-PARTAGE')
    expect(found?.orgId).toBe(BRAVO.orgId)
  })
})

describe('compteur kilométrique', () => {
  it('n’est PAS touché au premier passage — il n’y a pas de point de reprise', async () => {
    const { vehicle } = await equippedVehicle()

    const result = await syncGpsPositions(db, ALPHA, scriptedProvider([at(0, 0), at(60, 10_000)]), NOW)
    expect(result.kilometresAdded).toBe(0)

    const after = await vehicleRepository(db, ALPHA).findById(vehicle.id)
    expect(after?.currentKm).toBe(91_340)
  })

  it('avance une fois le point de reprise posé, et ne double pas si l’on rejoue', async () => {
    const { vehicle } = await equippedVehicle()
    const track = [at(0, 0), at(30, 5_000), at(60, 10_000)]

    await syncGpsPositions(db, ALPHA, scriptedProvider([track[0]!]), NOW)

    // 10 km parcourus depuis le point de reprise — le segment qui RACCORDE les deux
    // relèves est compté, sans quoi le compteur dériverait vers le bas à chaque tour.
    const second = await syncGpsPositions(db, ALPHA, scriptedProvider(track), NOW)
    expect(second.kilometresAdded).toBe(10)

    const afterSecond = await vehicleRepository(db, ALPHA).findById(vehicle.id)

    // Troisième passage sur la MÊME trace : le point de reprise a avancé, la fenêtre
    // est vide, le compteur ne bouge plus. C'est ce qui empêche un cron de gonfler
    // le kilométrage à chaque tour.
    const third = await syncGpsPositions(db, ALPHA, scriptedProvider(track), NOW)
    expect(third.kilometresAdded).toBe(0)

    const afterThird = await vehicleRepository(db, ALPHA).findById(vehicle.id)
    expect(afterThird?.currentKm).toBe(afterSecond?.currentKm)
  })
})

describe('zones', () => {
  async function circleZone(radiusM: number) {
    return geofenceRepository(db, ALPHA).insert({
      name: 'Agence',
      kind: 'circle',
      geometryJson: JSON.stringify({ kind: 'circle', center: AGENCY, radiusM }),
      radiusM,
      appliesTo: 'all',
      appliesToValue: null,
      isActive: true,
    })
  }

  it('constate une sortie, une seule fois', async () => {
    const { vehicle } = await equippedVehicle()
    await circleZone(500)

    // Premier passage : le véhicule est DANS la zone, on prend acte sans alerter.
    const first = await syncGpsPositions(db, ALPHA, scriptedProvider([at(0, 50)]), NOW)
    expect(first.geofenceEvents).toBe(0)

    // Deuxième : il s'éloigne franchement. Une sortie, et une seule.
    const second = await syncGpsPositions(db, ALPHA, scriptedProvider([at(0, 50), at(30, 3_000)]), NOW)
    expect(second.geofenceEvents).toBe(1)

    const events = await geofenceEventRepository(db, ALPHA).since('2026-08-23T00:00:00.000Z')
    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('exit')
    expect(events[0]?.vehicleId).toBe(vehicle.id)

    // Rejouer ne réémet rien : l'état est mémorisé, et l'index unique garde le reste.
    const third = await syncGpsPositions(db, ALPHA, scriptedProvider([at(0, 50), at(30, 3_000)]), NOW)
    expect(third.geofenceEvents).toBe(0)
  })

  it('ignore une zone dont la géométrie ne se relit pas', async () => {
    await equippedVehicle()
    await geofenceRepository(db, ALPHA).insert({
      name: 'Illisible',
      kind: 'circle',
      geometryJson: '{ ceci n’est pas du JSON',
      appliesTo: 'all',
      appliesToValue: null,
      isActive: true,
    })

    const result = await syncGpsPositions(db, ALPHA, scriptedProvider([at(0, 50), at(30, 9_000)]), NOW)
    expect(result.geofenceEvents).toBe(0)
    expect(result.failures).toEqual([])
  })
})

describe('robustesse', () => {
  it('un boîtier en panne n’empêche pas les autres d’être relevés', async () => {
    await equippedVehicle(ALPHA, 'IMEI-OK')
    await equippedVehicle(ALPHA, 'IMEI-KO')

    const provider: GpsProvider = {
      name: 'mock',
      listDevices: () => Promise.resolve([]),
      fetchPositions: ({ externalDeviceId, from, to }) =>
        externalDeviceId === 'IMEI-KO'
          ? Promise.reject(new Error('boîtier injoignable'))
          : createMockProvider().fetchPositions({ externalDeviceId, from, to }),
    }

    const result = await syncGpsPositions(db, ALPHA, provider, NOW)
    expect(result.failures).toHaveLength(1)
    expect(result.inserted).toBeGreaterThan(0)
  })
})

describe('rétention', () => {
  it('purge les positions anciennes, garde les récentes, et ne touche pas au voisin', async () => {
    const { device } = await equippedVehicle(ALPHA, 'IMEI-VIEUX')
    const { device: other } = await equippedVehicle(BRAVO, 'IMEI-AUTRE')

    const positions = gpsPositionRepository(db, ALPHA)
    await positions.ingest([
      { deviceId: device.id, recordedAt: '2024-01-01T10:00:00.000Z', lat: 33.6, lng: -7.6 },
      { deviceId: device.id, recordedAt: '2026-08-20T10:00:00.000Z', lat: 33.6, lng: -7.6 },
    ])
    await gpsPositionRepository(db, BRAVO).ingest([
      { deviceId: other.id, recordedAt: '2024-01-01T10:00:00.000Z', lat: 33.6, lng: -7.6 },
    ])

    const deleted = await purgeGpsPositions(db, ALPHA, { retentionDays: 365, now: NOW })
    expect(deleted).toBe(1)

    const remaining = await positions.since('2000-01-01T00:00:00.000Z')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.recordedAt).toBe('2026-08-20T10:00:00.000Z')

    // La purge d'Alpha ne touche pas une ligne de Bravo, même plus ancienne.
    expect(await gpsPositionRepository(db, BRAVO).since('2000-01-01T00:00:00.000Z')).toHaveLength(1)
  })

  /** Un plancher : personne ne doit pouvoir purger la semaine en cours par erreur. */
  it('refuse une rétention absurdement courte en la ramenant au plancher', async () => {
    const { device } = await equippedVehicle(ALPHA, 'IMEI-PLANCHER')
    await gpsPositionRepository(db, ALPHA).ingest([
      { deviceId: device.id, recordedAt: '2026-08-23T10:00:00.000Z', lat: 33.6, lng: -7.6 },
    ])

    // 1 jour demandé, 30 appliqués : la position d'hier survit.
    expect(await purgeGpsPositions(db, ALPHA, { retentionDays: 1, now: NOW })).toBe(0)
  })

  it('garde l’événement de zone même quand la position qui l’a produit disparaît', async () => {
    const { device, vehicle } = await equippedVehicle(ALPHA, 'IMEI-ZONE')
    await geofenceRepository(db, ALPHA).insert({
      name: 'Agence',
      kind: 'circle',
      geometryJson: JSON.stringify({ kind: 'circle', center: AGENCY, radiusM: 500 }),
      radiusM: 500,
      appliesTo: 'all',
      appliesToValue: null,
      isActive: true,
    })
    await geofenceEventRepository(db, ALPHA).record([
      {
        geofenceId: (await geofenceRepository(db, ALPHA).list())[0]!.id,
        vehicleId: vehicle.id,
        kind: 'exit',
        occurredAt: '2024-02-01T10:00:00.000Z',
        positionId: null,
      },
    ])
    await gpsPositionRepository(db, ALPHA).ingest([
      { deviceId: device.id, recordedAt: '2024-02-01T10:00:00.000Z', lat: 33.6, lng: -7.6 },
    ])

    await purgeGpsPositions(db, ALPHA, { retentionDays: 365, now: NOW })

    // On jette la matière première, on garde ce qu'on en a conclu.
    const events = await geofenceEventRepository(db, ALPHA).since('2000-01-01T00:00:00.000Z')
    expect(events).toHaveLength(1)
  })
})

describe('kilomètres par jour', () => {
  it('accumule dans la journée au lieu de l’écraser', async () => {
    const { device, vehicle } = await equippedVehicle(ALPHA, 'IMEI-RYTHME')
    const daily = vehicleDailyKmRepository(db, ALPHA)

    // Deux relèves successives le même jour : la seconde s'ajoute à la première.
    await syncGpsPositions(db, ALPHA, scriptedProvider([at(0, 0)]), NOW)
    await syncGpsPositions(db, ALPHA, scriptedProvider([at(0, 0), at(30, 5_000)]), NOW)
    await syncGpsPositions(
      db,
      ALPHA,
      scriptedProvider([at(0, 0), at(30, 5_000), at(60, 12_000)]),
      NOW,
    )

    const days = await daily.since(vehicle.id, '2026-01-01')
    expect(days).toHaveLength(1)
    expect(days[0]?.km).toBe(12)
    expect(device.id).toBeTruthy()
  })

  it('ne compte rien quand la voiture n’a pas bougé', async () => {
    const { vehicle } = await equippedVehicle(ALPHA, 'IMEI-GARE')

    await syncGpsPositions(db, ALPHA, scriptedProvider([at(0, 0, 1)]), NOW)
    await syncGpsPositions(db, ALPHA, scriptedProvider([at(0, 0, 1), at(30, 8, 1)]), NOW)

    expect(await vehicleDailyKmRepository(db, ALPHA).since(vehicle.id, '2026-01-01')).toHaveLength(0)
  })
})
