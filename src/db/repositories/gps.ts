import { and, asc, desc, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm'

import type { Db } from '../client'
import { nowIso } from '../schema/_shared'
import {
  geofenceEvents,
  geofences,
  gpsDevices,
  gpsPositions,
  vehicleDailyKm,
} from '../schema/gps'
import { assertCanWrite, withTenant, type TenantContext } from '../tenant'
import { forOrg } from './base'

/**
 * Repositories du GPS.
 *
 * `gps_positions` est la seule table à fort volume du produit : une voiture équipée
 * envoie de l'ordre de 3 000 positions par jour. Toutes les lectures passent donc par
 * une FENÊTRE de temps, jamais par un `list()` sec — et l'index
 * `(org_id, device_id, recorded_at)` est là pour ça.
 *
 * Comme partout, rien n'est exporté qui n'exige un `TenantContext`.
 */

export type GpsDeviceRow = typeof gpsDevices.$inferSelect
export type GpsPositionRow = typeof gpsPositions.$inferSelect
export type GeofenceRow = typeof geofences.$inferSelect
export type GeofenceEventRow = typeof geofenceEvents.$inferSelect
export type VehicleDailyKmRow = typeof vehicleDailyKm.$inferSelect

/* ------------------------------------------------------------------ boîtiers */

export function gpsDeviceRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<GpsDeviceRow>(db, ctx, gpsDevices)

  return {
    ...base,

    async listActive(): Promise<GpsDeviceRow[]> {
      return base.list(eq(gpsDevices.isActive, true))
    },

    async findByVehicle(vehicleId: string): Promise<GpsDeviceRow | undefined> {
      const rows = await base.list(eq(gpsDevices.vehicleId, vehicleId))
      return rows[0]
    },

    /**
     * Recherche par identifiant CHEZ LE FOURNISSEUR.
     *
     * Elle passe par `base.list()`, qui applique le filtre d'organisation : deux
     * clients peuvent parfaitement avoir des boîtiers portant le même identifiant
     * sur deux instances Traccar différentes.
     */
    async findByExternalId(externalId: string): Promise<GpsDeviceRow | undefined> {
      const rows = await base.list(eq(gpsDevices.externalId, externalId))
      return rows[0]
    },

    async touchLastSeen(id: string, at: string): Promise<void> {
      await base.update(id, { lastSeenAt: at })
    },
  }
}

/* ----------------------------------------------------------------- positions */

export function gpsPositionRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<GpsPositionRow>(db, ctx, gpsPositions)

  /** Filtre commun : cette organisation, lignes vivantes. Aucune lecture ne s'en passe. */
  const scope = () => and(eq(gpsPositions.orgId, ctx.orgId), isNull(gpsPositions.deletedAt))!

  return {
    ...base,

    /**
     * Ingestion en masse.
     *
     * `onConflictDoNothing` sur `gps_positions_unique` : c'est l'index qui porte
     * l'idempotence, pas ce code. Relancer une synchronisation sur une fenêtre déjà
     * ingérée ne crée rien et n'échoue pas.
     */
    async ingest(
      rows: ReadonlyArray<Omit<typeof gpsPositions.$inferInsert, 'orgId'>>,
    ): Promise<number> {
      if (rows.length === 0) return 0
      assertCanWrite(ctx)

      return withTenant(db, ctx, async (tx) => {
        const inserted = await tx
          .insert(gpsPositions)
          .values(rows.map((row) => ({ ...row, orgId: ctx.orgId })))
          .onConflictDoNothing()
          .returning({ id: gpsPositions.id })
        return inserted.length
      })
    },

    /** Trace d'un boîtier sur une fenêtre, en ordre chronologique. */
    async track(deviceId: string, from: string, to: string): Promise<GpsPositionRow[]> {
      return withTenant(db, ctx, async (tx) =>
        tx
          .select()
          .from(gpsPositions)
          .where(
            and(
              scope(),
              eq(gpsPositions.deviceId, deviceId),
              gte(gpsPositions.recordedAt, from),
              lte(gpsPositions.recordedAt, to),
            ),
          )
          .orderBy(asc(gpsPositions.recordedAt)),
      )
    },

    /**
     * Dernière position connue de chaque boîtier, depuis `since`.
     *
     * UNE requête pour toute la flotte, pas une par véhicule : c'est un balayage
     * d'index sur une fenêtre courte, réduit en mémoire. La variante « dernière
     * position par boîtier » en SQL demanderait une sous-requête corrélée, donc du
     * SQL brut — interdit par la règle 6 de la charte hors migrations.
     */
    async latestPerDevice(since: string): Promise<Map<string, GpsPositionRow>> {
      const rows = await withTenant(db, ctx, async (tx) =>
        tx
          .select()
          .from(gpsPositions)
          .where(and(scope(), gte(gpsPositions.recordedAt, since)))
          .orderBy(asc(gpsPositions.recordedAt)),
      )

      const latest = new Map<string, GpsPositionRow>()
      for (const row of rows) latest.set(row.deviceId, row)
      return latest
    },

    /** Toutes les positions de la flotte sur une fenêtre, en ordre chronologique. */
    async since(from: string): Promise<GpsPositionRow[]> {
      return withTenant(db, ctx, async (tx) =>
        tx
          .select()
          .from(gpsPositions)
          .where(and(scope(), gte(gpsPositions.recordedAt, from)))
          .orderBy(asc(gpsPositions.recordedAt)),
      )
    },

    /**
     * Relevés EN MOUVEMENT sur une fenêtre.
     *
     * Le filtre de vitesse est poussé dans la requête, pas appliqué après : une
     * flotte de quarante voitures produit 43 000 positions par jour, dont l'immense
     * majorité à l'arrêt. Les ramener toutes en mémoire pour en jeter 95 % est
     * exactement le genre de détail qui ne se voit pas en développement et qui fait
     * tomber le serveur chez le premier client sérieux.
     */
    async movingSince(from: string, minKmh: number): Promise<GpsPositionRow[]> {
      return withTenant(db, ctx, async (tx) =>
        tx
          .select()
          .from(gpsPositions)
          .where(
            and(
              scope(),
              gte(gpsPositions.recordedAt, from),
              gte(gpsPositions.speedKmh, minKmh),
            ),
          )
          .orderBy(asc(gpsPositions.recordedAt)),
      )
    },

    /**
     * PURGE — la seule suppression DURE du produit, et elle est assumée.
     *
     * La charte impose le soft delete partout (règle 8) « hors purges documentées ».
     * En voici une, et c'est ici qu'elle est documentée : une ligne `deleted_at`
     * pèse exactement autant qu'une ligne vivante, or c'est le POIDS qu'on cherche à
     * réduire. Marquer 40 millions de positions comme supprimées ne libère rien.
     *
     * Ce qui rend la suppression acceptable : une position est une mesure, pas un
     * acte de gestion. Aucune facture, aucun contrat, aucune amende n'y renvoie —
     * seuls les événements de zone gardent un `position_id`, et ils gardent aussi
     * leur propre horodatage, donc ils restent lisibles sans elle.
     */
    async purgeOlderThan(instant: string): Promise<number> {
      assertCanWrite(ctx)
      return withTenant(db, ctx, async (tx) => {
        const removed = await tx
          .delete(gpsPositions)
          .where(and(eq(gpsPositions.orgId, ctx.orgId), lt(gpsPositions.recordedAt, instant)))
          .returning({ id: gpsPositions.id })
        return removed.length
      })
    },

    /**
     * Dernier relevé connu d'un boîtier.
     *
     * Il sert deux fois, et c'est pour cela qu'il ne s'agit pas seulement d'une date :
     *  - son horodatage est le POINT DE REPRISE de la synchronisation ;
     *  - sa position est l'ÉTAT DE DÉPART de la détection de zones. Sans elle, chaque
     *    relève repartirait d'un état inconnu et ne constaterait plus jamais un
     *    franchissement (voir la règle 2 de src/core/geofencing.ts).
     */
    async lastPosition(deviceId: string): Promise<GpsPositionRow | undefined> {
      const rows = await withTenant(db, ctx, async (tx) =>
        tx
          .select()
          .from(gpsPositions)
          .where(and(scope(), eq(gpsPositions.deviceId, deviceId)))
          .orderBy(desc(gpsPositions.recordedAt))
          .limit(1),
      )
      return rows[0]
    },
  }
}

/* ------------------------------------------------------- kilomètres par jour */

export function vehicleDailyKmRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<VehicleDailyKmRow>(db, ctx, vehicleDailyKm)
  const scope = () => and(eq(vehicleDailyKm.orgId, ctx.orgId), isNull(vehicleDailyKm.deletedAt))!

  return {
    ...base,

    /**
     * Ajoute des kilomètres à une journée.
     *
     * `onConflictDoUpdate` ACCUMULE au lieu d'écraser : une journée reçoit une
     * trentaine de relèves, et la dernière ne remplace pas les précédentes. Ce n'est
     * pas idempotent en soi — c'est l'appelant qui l'est, puisqu'il ne traite que les
     * positions réellement nouvelles (voir `syncGpsPositions`).
     *
     * **Troisième et dernière exception à la règle 6** (pas de SQL brut hors migrations
     * et hors `aliveOnly`) : le `sql` ci-dessous. L'incrément doit se faire DANS la
     * base — lire puis réécrire ouvrirait une fenêtre où deux relèves concurrentes
     * s'écraseraient l'une l'autre. Le fragment est identique en SQLite et en
     * Postgres. Consigné dans docs/DECISIONS.md §13.6.
     */
    async add(vehicleId: string, onDay: string, km: number, source = 'gps'): Promise<void> {
      if (km <= 0) return
      assertCanWrite(ctx)

      await withTenant(db, ctx, async (tx) => {
        await tx
          .insert(vehicleDailyKm)
          .values({ orgId: ctx.orgId, vehicleId, onDay, km, source })
          .onConflictDoUpdate({
            target: [vehicleDailyKm.orgId, vehicleDailyKm.vehicleId, vehicleDailyKm.onDay],
            set: { km: sql`${vehicleDailyKm.km} + ${km}`, updatedAt: nowIso() },
          })
      })
    },

    /** Journées d'un véhicule depuis une date civile. Au plus quelques dizaines de lignes. */
    async since(vehicleId: string, fromDay: string): Promise<VehicleDailyKmRow[]> {
      return withTenant(db, ctx, async (tx) =>
        tx
          .select()
          .from(vehicleDailyKm)
          .where(
            and(
              scope(),
              eq(vehicleDailyKm.vehicleId, vehicleId),
              gte(vehicleDailyKm.onDay, fromDay),
            ),
          )
          .orderBy(asc(vehicleDailyKm.onDay)),
      )
    },
  }
}

/* --------------------------------------------------------------------- zones */

export function geofenceRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<GeofenceRow>(db, ctx, geofences)

  return {
    ...base,
    async listActive(): Promise<GeofenceRow[]> {
      return base.list(eq(geofences.isActive, true))
    },
  }
}

export function geofenceEventRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<GeofenceEventRow>(db, ctx, geofenceEvents)

  const scope = () => and(eq(geofenceEvents.orgId, ctx.orgId), isNull(geofenceEvents.deletedAt))!

  return {
    ...base,

    async record(
      rows: ReadonlyArray<Omit<typeof geofenceEvents.$inferInsert, 'orgId'>>,
    ): Promise<number> {
      if (rows.length === 0) return 0
      assertCanWrite(ctx)

      return withTenant(db, ctx, async (tx) => {
        const inserted = await tx
          .insert(geofenceEvents)
          .values(rows.map((row) => ({ ...row, orgId: ctx.orgId })))
          .onConflictDoNothing()
          .returning({ id: geofenceEvents.id })
        return inserted.length
      })
    },

    async since(from: string): Promise<GeofenceEventRow[]> {
      return withTenant(db, ctx, async (tx) =>
        tx
          .select()
          .from(geofenceEvents)
          .where(and(scope(), gte(geofenceEvents.occurredAt, from)))
          .orderBy(desc(geofenceEvents.occurredAt)),
      )
    },

  }
}
