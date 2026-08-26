import { boundsOf } from '~/core/geo'
import { formatPlate, parsePlate } from '~/core/plate'
import { parseGeometry } from '~/core/schemas/gps'
import type { Db } from '~/db/client'
import {
  geofenceRepository,
  gpsDeviceRepository,
  gpsPositionRepository,
} from '~/db/repositories/gps'
import { vehicleRepository } from '~/db/repositories/vehicles'
import type { TenantContext } from '~/db/tenant'
import { requireRole } from '~/auth/guards'
import { can } from '../plan'
import {
  LIVE_WINDOW_MS,
  STALE_AFTER_MINUTES,
  type FleetPosition,
  type FleetSnapshot,
  type GeofenceSummary,
  type GpsView,
} from '../gps'

/**
 * LECTURES du suivi GPS — mesurables, donc hors du module de server functions.
 * Voir `src/server/reads/vehicles.ts` pour la raison, et docs/DECISIONS.md §13.7.
 */

/** Le rôle qui n'a rien à faire sur la carte. Matrice : docs/DOMAIN.md §3.1. */
function requireGpsReader(ctx: TenantContext): void {
  requireRole(ctx, 'owner', 'manager', 'agent', 'viewer')
}

async function readGeofences(db: Db, tenant: TenantContext): Promise<GeofenceSummary[]> {
  const rows = await geofenceRepository(db, tenant).list()
  const summaries: GeofenceSummary[] = []

  for (const row of rows) {
    const geometry = parseGeometry(row.geometryJson)
    // Une zone dont la géométrie ne se relit pas n'est pas affichée : mieux vaut une
    // zone absente qu'une zone dessinée au mauvais endroit.
    if (!geometry) continue
    summaries.push({
      id: row.id,
      name: row.name,
      geometry,
      appliesTo: row.appliesTo,
      appliesToValue: row.appliesToValue,
      isActive: row.isActive,
    })
  }
  return summaries
}

/**
 * L'instantané de la flotte, en QUATRE requêtes — plus une pour la garde par plan.
 *
 * Quelle que soit la taille de la flotte : véhicules, boîtiers, dernières positions
 * sur une fenêtre, zones. Rien n'est lu par véhicule ; le rapprochement se fait en
 * mémoire. `tests/unit/queries.test.ts` le compte et échoue si ce nombre bouge.
 *
 * Extraite du gestionnaire pour être mesurable : un `createServerFn` ne s'appelle pas
 * depuis un test sans requête HTTP.
 */
export async function readFleetSnapshot(
  db: Db,
  tenant: TenantContext,
  now = Date.now(),
): Promise<GpsView<FleetSnapshot>> {
  requireGpsReader(tenant)

  if (!(await can(tenant, 'gps.track', db))) {
    return { locked: true, planCode: tenant.planCode }
  }

  const since = new Date(now - LIVE_WINDOW_MS).toISOString()

  const vehicles = await vehicleRepository(db, tenant).list()
  const devices = await gpsDeviceRepository(db, tenant).listActive()
  const latest = await gpsPositionRepository(db, tenant).latestPerDevice(since)

  const deviceByVehicle = new Map(
    devices.filter((device) => device.vehicleId).map((device) => [device.vehicleId!, device]),
  )

  const positions: FleetPosition[] = []
  const untracked: FleetSnapshot['untracked'] = []

  for (const vehicle of vehicles) {
    const parsed = parsePlate(vehicle.plate)
    const plate = parsed ? formatPlate(parsed) : vehicle.plate
    const device = deviceByVehicle.get(vehicle.id)
    const position = device ? latest.get(device.id) : undefined

    if (!device || !position) {
      untracked.push({ id: vehicle.id, plate, make: vehicle.make, model: vehicle.model })
      continue
    }

    const ageMinutes = Math.max(0, Math.round((now - Date.parse(position.recordedAt)) / 60_000))
    positions.push({
      vehicleId: vehicle.id,
      deviceId: device.id,
      plate,
      make: vehicle.make,
      model: vehicle.model,
      status: vehicle.status,
      lat: position.lat,
      lng: position.lng,
      speedKmh: position.speedKmh,
      heading: position.heading,
      recordedAt: position.recordedAt,
      ageMinutes,
      stale: ageMinutes > STALE_AFTER_MINUTES,
    })
  }

  return {
    locked: false,
    positions,
    untracked,
    bounds: boundsOf(positions.map((position) => ({ lat: position.lat, lng: position.lng }))),
    geofences: await readGeofences(db, tenant),
    styleUrl: process.env['MAP_STYLE_URL'] ?? null,
  }
}
