import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'

import { boundsOf, type Bounds } from '~/core/geo'
import { formatPlate, parsePlate } from '~/core/plate'
import {
  AssignDeviceInput,
  CreateGeofenceInput,
  GeofenceIdInput,
  MAX_TRACK_DAYS,
  RegisterDeviceInput,
  UpdateGeofenceInput,
  VehicleTrackInput,
  type GeofenceGeometry,
} from '~/core/schemas/gps'
import { travelledDistance } from '~/core/tracking'
import { requireRole } from '~/auth/guards'
import { getDb } from '~/db/client'
import {
  geofenceEventRepository,
  geofenceRepository,
  gpsDeviceRepository,
  gpsPositionRepository,
} from '~/db/repositories/gps'
import { vehicleRepository } from '~/db/repositories/vehicles'
import type { TenantContext } from '~/db/tenant'
import { audit } from './audit'
import { resolveGpsProvider } from './gps/index'
import { syncGpsPositions } from './gps/sync'
import { tenantMiddleware, writableTenantMiddleware } from './middleware'
import { can } from './plan'

/**
 * SUIVI GPS — les fonctions serveur.
 *
 * Deux vérifications s'ajoutent ici à celle de l'organisation, et elles ne disent
 * pas la même chose :
 *  - le **rôle** (`gps: ['read']`) : le mécanicien ne suit pas la flotte, ce n'est
 *    pas son métier ;
 *  - le **plan** (`can(org, 'gps.track')`) : le suivi n'est pas dans toutes les offres.
 *
 * Le plan verrouillé n'est PAS une erreur : il renvoie un état `locked`, que l'écran
 * sait présenter. Une erreur technique à la place d'une offre à souscrire, c'est un
 * client qui appelle le support au lieu de payer.
 */

/** Fenêtre de fraîcheur de la carte. Au-delà, un véhicule est « sans signal ». */
export const LIVE_WINDOW_MS = 24 * 3_600_000

/** Au-delà, le point affiché n'est plus une position mais un souvenir. */
export const STALE_AFTER_MINUTES = 30

export interface FleetPosition {
  vehicleId: string
  deviceId: string
  plate: string
  make: string
  model: string
  status: string
  lat: number
  lng: number
  speedKmh: number | null
  heading: number | null
  recordedAt: string
  /** Âge du relevé en minutes — c'est lui, pas la date, qui dit si le point vaut. */
  ageMinutes: number
  stale: boolean
}

export interface FleetSnapshot {
  positions: FleetPosition[]
  /** Véhicules sans boîtier : ils existent, la carte ne peut simplement rien en dire. */
  untracked: Array<{ id: string; plate: string; make: string; model: string }>
  bounds: Bounds | undefined
  geofences: GeofenceSummary[]
  /**
   * Fond de carte. `null` = plan vierge, aucune requête vers un tiers.
   *
   * Il vient de l'environnement du SERVEUR et non d'une variable `VITE_` : choisir un
   * fournisseur de tuiles engage des conditions d'usage et envoie l'adresse IP du
   * client à chaque déplacement de la carte. C'est une décision de déploiement.
   */
  styleUrl: string | null
}

export interface GeofenceSummary {
  id: string
  name: string
  geometry: GeofenceGeometry
  appliesTo: string
  appliesToValue: string | null
  isActive: boolean
}

export type GpsView<T> = { locked: true; planCode: string } | ({ locked: false } & T)

/** Le rôle qui n'a rien à faire sur la carte. Voir la matrice docs/DOMAIN.md §3.1. */
function requireGpsReader(ctx: TenantContext): void {
  requireRole(ctx, 'owner', 'manager', 'agent', 'viewer')
}

/* ------------------------------------------------------------------- lecture */

export const loadFleetSnapshot = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<GpsView<FleetSnapshot>> => {
    const { readFleetSnapshot } = await import('./reads/fleet')
    return readFleetSnapshot(getDb(), context.tenant)
  })

export interface VehicleTrack {
  vehicleId: string
  plate: string
  points: Array<{ at: string; lat: number; lng: number; speedKmh: number | null }>
  distanceKm: number
  /** Positions écartées comme physiquement impossibles — dit à l'écran quoi ne pas croire. */
  discarded: number
  bounds: Bounds | undefined
}

export const loadVehicleTrack = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .validator(VehicleTrackInput)
  .handler(async ({ data, context }): Promise<GpsView<VehicleTrack>> => {
    const db = getDb()
    const tenant = context.tenant
    requireGpsReader(tenant)

    if (!(await can(tenant, 'gps.track', db))) {
      return { locked: true, planCode: tenant.planCode }
    }

    const vehicle = await vehicleRepository(db, tenant).findById(data.vehicleId)
    // Véhicule d'une autre organisation : 404, jamais 403.
    if (!vehicle) throw notFound()

    const from = Date.parse(data.from)
    const to = Date.parse(data.to)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw notFound()

    // La fenêtre est bornée côté SERVEUR : une borne venue du client ne protège rien.
    const cappedFrom = Math.max(from, to - MAX_TRACK_DAYS * 24 * 3_600_000)

    const device = await gpsDeviceRepository(db, tenant).findByVehicle(vehicle.id)
    const parsed = parsePlate(vehicle.plate)
    const plate = parsed ? formatPlate(parsed) : vehicle.plate

    if (!device) {
      return { locked: false, vehicleId: vehicle.id, plate, points: [], distanceKm: 0, discarded: 0, bounds: undefined }
    }

    const rows = await gpsPositionRepository(db, tenant).track(
      device.id,
      new Date(cappedFrom).toISOString(),
      new Date(to).toISOString(),
    )

    const { meters, odometerKm, discarded } = travelledDistance(
      rows.map((row) => ({
        at: row.recordedAt,
        point: { lat: row.lat, lng: row.lng },
        speedKmh: row.speedKmh,
        odometerKm: row.odometerKm,
      })),
    )

    return {
      locked: false,
      vehicleId: vehicle.id,
      plate,
      points: rows.map((row) => ({
        at: row.recordedAt,
        lat: row.lat,
        lng: row.lng,
        speedKmh: row.speedKmh,
      })),
      distanceKm: Math.round(odometerKm ?? meters / 1000),
      discarded,
      bounds: boundsOf(rows.map((row) => ({ lat: row.lat, lng: row.lng }))),
    }
  })

/* ------------------------------------------------------------------- écriture */

export const createGeofence = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CreateGeofenceInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    // Dessiner une zone est un acte de gestion, pas de comptoir.
    requireRole(tenant, 'owner', 'manager')

    const created = await geofenceRepository(db, tenant).insert({
      name: data.name,
      kind: data.geometry.kind,
      geometryJson: JSON.stringify(data.geometry),
      radiusM: data.geometry.kind === 'circle' ? data.geometry.radiusM : null,
      appliesTo: data.appliesTo,
      appliesToValue: data.appliesToValue,
      isActive: true,
    })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'geofence.create',
      entityType: 'geofence',
      entityId: created.id,
      after: { name: data.name, kind: data.geometry.kind },
    })

    return { id: created.id }
  })

export const updateGeofence = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateGeofenceInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    const repository = geofenceRepository(db, tenant)
    const existing = await repository.findById(data.id)
    if (!existing) throw notFound()

    const updated = await repository.update(data.id, {
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.geometry === undefined
        ? {}
        : {
            kind: data.geometry.kind,
            geometryJson: JSON.stringify(data.geometry),
            radiusM: data.geometry.kind === 'circle' ? data.geometry.radiusM : null,
          }),
      ...(data.appliesTo === undefined ? {} : { appliesTo: data.appliesTo }),
      ...(data.appliesToValue === undefined ? {} : { appliesToValue: data.appliesToValue }),
      ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
    })

    return { id: updated?.id ?? data.id }
  })

export const deleteGeofence = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(GeofenceIdInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    // Suppression douce : les événements déjà émis gardent une zone à nommer.
    const removed = await geofenceRepository(getDb(), tenant).softDelete(data.id)
    if (!removed) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'geofence.delete',
      entityType: 'geofence',
      entityId: data.id,
    })

    return { ok: true }
  })

export const registerDevice = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(RegisterDeviceInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    if (data.vehicleId) {
      const vehicle = await vehicleRepository(db, tenant).findById(data.vehicleId)
      if (!vehicle) throw notFound()
    }

    const devices = gpsDeviceRepository(db, tenant)
    const known = await devices.findByExternalId(data.externalId)
    // Le même boîtier posé deux fois, c'est deux traces parallèles pour une voiture.
    if (known) return { id: known.id, alreadyKnown: true }

    const created = await devices.insert({
      vehicleId: data.vehicleId,
      provider: data.provider,
      externalId: data.externalId,
      imei: data.imei ?? null,
      simNumber: data.simNumber ?? null,
      installedOn: data.installedOn ?? null,
      isActive: true,
    })

    return { id: created.id, alreadyKnown: false }
  })

export const assignDevice = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(AssignDeviceInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    if (data.vehicleId) {
      const vehicle = await vehicleRepository(db, tenant).findById(data.vehicleId)
      if (!vehicle) throw notFound()
    }

    const updated = await gpsDeviceRepository(db, tenant).update(data.id, {
      vehicleId: data.vehicleId,
    })
    if (!updated) throw notFound()

    return { id: updated.id }
  })

/**
 * Synchronisation à la demande.
 *
 * Le balayage périodique viendra du même chemin (`syncGpsPositions`) : cette
 * fonction existe pour qu'un gérant puisse dire « regarde maintenant » sans
 * attendre la minute suivante, et pour que la démo n'ait pas besoin d'un cron.
 */
export const syncNow = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .handler(async ({ context }) => {
    const db = getDb()
    const tenant = context.tenant
    requireRole(tenant, 'owner', 'manager')

    if (!(await can(tenant, 'gps.track', db))) {
      return { locked: true as const, planCode: tenant.planCode }
    }

    const result = await syncGpsPositions(db, tenant, resolveGpsProvider())
    return { locked: false as const, ...result }
  })

/* ---------------------------------------------------------------- événements */

export interface GeofenceCrossing {
  id: string
  vehicleId: string
  plate: string
  geofenceId: string
  geofenceName: string
  kind: string
  occurredAt: string
}

export const listRecentCrossings = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<GeofenceCrossing[]> => {
    const db = getDb()
    const tenant = context.tenant
    requireGpsReader(tenant)
    if (!(await can(tenant, 'gps.track', db))) return []

    const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString()
    const events = await geofenceEventRepository(db, tenant).since(since)
    if (events.length === 0) return []

    const zones = new Map((await geofenceRepository(db, tenant).list()).map((row) => [row.id, row]))
    const vehicles = new Map(
      (await vehicleRepository(db, tenant).list()).map((row) => {
        const parsed = parsePlate(row.plate)
        return [row.id, parsed ? formatPlate(parsed) : row.plate]
      }),
    )

    return events.map((event) => ({
      id: event.id,
      vehicleId: event.vehicleId,
      plate: vehicles.get(event.vehicleId) ?? event.vehicleId,
      geofenceId: event.geofenceId,
      geofenceName: zones.get(event.geofenceId)?.name ?? event.geofenceId,
      kind: event.kind,
      occurredAt: event.occurredAt,
    }))
  })
