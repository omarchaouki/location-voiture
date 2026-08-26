import { parseGeometry } from '~/core/schemas/gps'
import { evaluateGeofences, type GeofenceShape } from '~/core/geofencing'
import { isLatLng } from '~/core/geo'
import { odometerDeltaKm, type TrackStep } from '~/core/tracking'
import type { Db } from '~/db/client'
import {
  geofenceEventRepository,
  geofenceRepository,
  gpsDeviceRepository,
  gpsPositionRepository,
  vehicleDailyKmRepository,
  type GeofenceRow,
  type GpsDeviceRow,
} from '~/db/repositories/gps'
import { vehicleRepository } from '~/db/repositories/vehicles'
import type { TenantContext } from '~/db/tenant'
import { businessCivilDate } from '~/i18n/format'
import type { GpsProvider } from './provider'

/**
 * INGESTION — le seul chemin par lequel une position entre dans le produit.
 *
 * Trois temps, comme le balayage d'alertes :
 *  1. tirer du fournisseur ce qui manque depuis le dernier relevé connu ;
 *  2. l'écrire (l'index unique fait l'idempotence, pas ce code) ;
 *  3. en déduire ce qui intéresse le métier — le kilométrage et les zones.
 *
 * Rien ici ne suppose que la fonction n'a jamais tourné : elle peut être relancée à
 * volonté, sur des fenêtres qui se recouvrent, sans rien créer en double.
 */

export interface GpsSyncResult {
  devices: number
  fetched: number
  inserted: number
  geofenceEvents: number
  kilometresAdded: number
  /** Boîtiers dont la synchronisation a échoué, avec la raison. */
  failures: Array<{ deviceId: string; reason: string }>
}

/** Fenêtre de rattrapage au premier passage. Au-delà, on ne remonte pas le temps. */
const FIRST_RUN_WINDOW_MS = 24 * 3_600_000

export async function syncGpsPositions(
  db: Db,
  ctx: TenantContext,
  provider: GpsProvider,
  now: Date = new Date(),
): Promise<GpsSyncResult> {
  const devices = gpsDeviceRepository(db, ctx)
  const positions = gpsPositionRepository(db, ctx)
  const vehicles = vehicleRepository(db, ctx)

  const active = await devices.listActive()
  const result: GpsSyncResult = {
    devices: active.length,
    fetched: 0,
    inserted: 0,
    geofenceEvents: 0,
    kilometresAdded: 0,
    failures: [],
  }
  if (active.length === 0) return result

  const shapes = toShapes(await geofenceRepository(db, ctx).listActive())
  const events = geofenceEventRepository(db, ctx)

  for (const device of active) {
    try {
      const previous = await positions.lastPosition(device.id)
      const checkpoint = previous?.recordedAt
      const from = checkpoint ?? new Date(now.getTime() - FIRST_RUN_WINDOW_MS).toISOString()

      const fetched = await provider.fetchPositions({
        externalDeviceId: device.externalId,
        from,
        to: now.toISOString(),
      })
      result.fetched += fetched.length

      const rows = fetched
        .filter((position) => isLatLng({ lat: position.lat, lng: position.lng }))
        // Le fournisseur peut renvoyer la borne basse elle-même : elle est déjà en base.
        .filter((position) => !checkpoint || position.recordedAt > checkpoint)
        .map((position) => ({
          deviceId: device.id,
          recordedAt: position.recordedAt,
          lat: position.lat,
          lng: position.lng,
          speedKmh: position.speedKmh,
          heading: position.heading,
          ignition: position.ignition,
          odometerKm: position.odometerKm,
          rawJson: JSON.stringify(position.raw),
        }))

      result.inserted += await positions.ingest(rows)
      await devices.touchLastSeen(device.id, now.toISOString())

      if (!device.vehicleId || rows.length === 0) continue

      /*
       * La trace évaluée COMMENCE par la dernière position déjà connue.
       *
       * Deux effets, et les deux comptent :
       *  - le kilomètre parcouru entre le dernier point de la relève précédente et le
       *    premier de celle-ci n'est plus perdu. Sans ce raccord, chaque relève
       *    oubliait un segment, et le compteur dérivait vers le bas, silencieusement ;
       *  - la détection de zones repart d'un état connu au lieu d'un état inconnu.
       * Le premier point ne peut rien émettre : il fixe l'état (règle 2 de
       * src/core/geofencing.ts). Bug trouvé par `tests/unit/gps-db.test.ts`.
       */
      const track: TrackStep[] = [
        ...(previous
          ? [
              {
                at: previous.recordedAt,
                point: { lat: previous.lat, lng: previous.lng },
                speedKmh: previous.speedKmh,
                odometerKm: previous.odometerKm,
              },
            ]
          : []),
        ...rows.map((row) => ({
          at: row.recordedAt,
          point: { lat: row.lat, lng: row.lng },
          speedKmh: row.speedKmh,
          odometerKm: row.odometerKm,
        })),
      ]

      /*
       * Le compteur n'est mis à jour que si l'on avait DÉJÀ un point de reprise.
       *
       * Au tout premier passage, la fenêtre de rattrapage couvre vingt-quatre heures :
       * les intégrer ajouterait une journée de route au compteur d'un véhicule le jour
       * où on lui pose un boîtier. On enregistre la trace, on ne touche pas au compteur.
       */
      if (checkpoint) {
        result.kilometresAdded += await addKilometres(
          vehicles,
          vehicleDailyKmRepository(db, ctx),
          device,
          track,
          now,
        )
      }

      /*
       * L'état de départ des zones est la GÉOMÉTRIE de la dernière position, jamais un
       * état stocké : déduit, il ne peut pas se désynchroniser de la réalité.
       */
      result.geofenceEvents += await recordGeofenceCrossings({
        events,
        shapes,
        vehicleId: device.vehicleId,
        vehicleCategory: (await vehicles.findById(device.vehicleId))?.category ?? null,
        track: track.map((step, index) => ({
          id: index === 0 && previous ? previous.id : null,
          at: step.at,
          point: step.point,
        })),
      })
    } catch (error) {
      // Un boîtier en panne ne doit pas emporter la synchronisation des trente autres.
      result.failures.push({ deviceId: device.id, reason: String(error) })
    }
  }

  return result
}

async function addKilometres(
  vehicles: ReturnType<typeof vehicleRepository>,
  daily: ReturnType<typeof vehicleDailyKmRepository>,
  device: GpsDeviceRow,
  track: TrackStep[],
  now: Date,
): Promise<number> {
  const delta = odometerDeltaKm(track)
  if (delta <= 0 || !device.vehicleId) return 0

  const vehicle = await vehicles.findById(device.vehicleId)
  if (!vehicle) return 0

  await vehicles.update(vehicle.id, {
    currentKm: vehicle.currentKm + delta,
    currentKmAt: now.toISOString(),
  })

  /*
   * Les mêmes kilomètres sont aussi portés à leur JOURNÉE.
   *
   * Le compteur du véhicule dit « où il en est » ; l'agrégat quotidien dit « à quel
   * rythme il roule », ce qui est la seule façon de projeter une échéance de vidange
   * en kilomètres. Relire 90 jours de positions pour la même réponse coûterait
   * 270 000 lignes — voir src/db/schema/gps.ts.
   *
   * La journée retenue est celle du DERNIER point de la fenêtre, à Casablanca : une
   * relève couvre deux minutes, l'erreur d'attribution ne dépasse donc jamais un
   * relevé, et seulement autour de minuit.
   */
  const lastAt = track[track.length - 1]?.at
  if (lastAt) {
    await daily.add(vehicle.id, businessCivilDate(new Date(lastAt)), delta)
  }

  return delta
}

async function recordGeofenceCrossings(input: {
  events: ReturnType<typeof geofenceEventRepository>
  shapes: ReadonlyArray<GeofenceShape>
  vehicleId: string
  vehicleCategory: string | null
  track: ReadonlyArray<{ id: string | null; at: string; point: { lat: number; lng: number } }>
}): Promise<number> {
  const applicable = input.shapes.filter((shape) => {
    if (shape.appliesTo === 'all') return true
    if (shape.appliesTo === 'vehicle') return shape.appliesToValue === input.vehicleId
    if (shape.appliesTo === 'category') return shape.appliesToValue === input.vehicleCategory
    return false
  })
  if (applicable.length === 0) return 0

  const { transitions } = evaluateGeofences({
    vehicleId: input.vehicleId,
    shapes: applicable,
    track: input.track,
    // Aucun état préalable : c'est le premier point de la trace qui le fixe.
    previous: {},
  })

  return input.events.record(
    transitions.map((transition) => ({
      geofenceId: transition.geofenceId,
      vehicleId: transition.vehicleId,
      kind: transition.kind,
      occurredAt: transition.occurredAt,
      positionId: transition.positionId,
    })),
  )
}

/** Traduit les lignes de `geofences` en formes exploitables. Une zone illisible est ignorée. */
export function toShapes(rows: ReadonlyArray<GeofenceRow>): GeofenceShape[] {
  const shapes: GeofenceShape[] = []

  for (const row of rows) {
    const geometry = parseGeometry(row.geometryJson)
    if (!geometry) continue

    shapes.push(
      geometry.kind === 'circle'
        ? {
            id: row.id,
            kind: 'circle',
            center: geometry.center,
            radiusM: geometry.radiusM,
            appliesTo: row.appliesTo,
            appliesToValue: row.appliesToValue,
          }
        : {
            id: row.id,
            kind: 'polygon',
            ring: geometry.ring,
            appliesTo: row.appliesTo,
            appliesToValue: row.appliesToValue,
          },
    )
  }

  return shapes
}
