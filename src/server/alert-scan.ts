import { eq } from 'drizzle-orm'

import { deadlineOf, evaluateAlerts, identityOf, type AlertDraft, type AlertSnapshot } from '~/core/alerts'
import { formatPlate, parsePlate } from '~/core/plate'
import type { Db } from '~/db/client'
import { alertRepository } from '~/db/repositories/alerts'
import { forOrg } from '~/db/repositories/base'
import { contracts } from '~/db/schema/contracts'
import { customers } from '~/db/schema/customers'
import {
  insurancePolicies,
  permits,
  roadTaxes,
  technicalInspections,
} from '~/db/schema/documents'
import { maintenanceSchedules } from '~/db/schema/maintenance'
import {
  geofenceEventRepository,
  geofenceRepository,
  gpsDeviceRepository,
  gpsPositionRepository,
} from '~/db/repositories/gps'
import { MOVING_KMH } from '~/core/tracking'
import { vehicles } from '~/db/schema/vehicles'
import type { TenantContext } from '~/db/tenant'
import { businessCivilDate } from '~/i18n/format'

/**
 * Exécution du moteur d'alertes pour UNE organisation.
 *
 * Trois temps, dans cet ordre :
 *  1. lire un instantané cloisonné ;
 *  2. évaluer les règles (fonction pure, testée à dates figées) ;
 *  3. réconcilier la base avec le résultat.
 *
 * La réconciliation est la partie délicate : il ne suffit pas d'insérer. Il faut
 * aussi CLORE ce qui n'a plus lieu d'être — une vignette payée, une police
 * renouvelée, un seuil dépassé par un plus grave. Sans cela, le centre de
 * notifications se remplit et personne ne le regarde plus.
 */

export interface AlertScanResult {
  evaluated: number
  created: number
  refreshed: number
  resolved: number
}

export async function readAlertSnapshot(db: Db, ctx: TenantContext): Promise<AlertSnapshot> {
  const now = new Date()
  const today = businessCivilDate(now)

  const vehicleRows = await forOrg<typeof vehicles.$inferSelect>(db, ctx, vehicles).list()
  const insuranceRows = await forOrg<typeof insurancePolicies.$inferSelect>(
    db,
    ctx,
    insurancePolicies,
  ).list(eq(insurancePolicies.isCurrent, true))
  const inspectionRows = await forOrg<typeof technicalInspections.$inferSelect>(
    db,
    ctx,
    technicalInspections,
  ).list(eq(technicalInspections.isCurrent, true))
  const roadTaxRows = await forOrg<typeof roadTaxes.$inferSelect>(db, ctx, roadTaxes).list()
  const permitRows = await forOrg<typeof permits.$inferSelect>(db, ctx, permits).list(
    eq(permits.isCurrent, true),
  )
  const maintenanceRows = await forOrg<typeof maintenanceSchedules.$inferSelect>(
    db,
    ctx,
    maintenanceSchedules,
  ).list(eq(maintenanceSchedules.isActive, true))
  const contractRows = await forOrg<typeof contracts.$inferSelect>(db, ctx, contracts).list()
  const customerRows = await forOrg<typeof customers.$inferSelect>(db, ctx, customers).list()

  const { geofenceExits, gpsMovements } = await readGpsFacts(db, ctx, now)

  return {
    today,
    now: now.toISOString(),
    vehicles: vehicleRows.map((row) => {
      const parsed = parsePlate(row.plate)
      return {
        id: row.id,
        plate: row.plate,
        label: `${parsed ? formatPlate(parsed) : row.plate} — ${row.make} ${row.model}`,
        currentKm: row.currentKm,
        status: row.status,
      }
    }),
    geofenceExits,
    gpsMovements,
    insurance: insuranceRows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      expiresOn: row.expiresOn,
    })),
    inspections: inspectionRows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      expiresOn: row.expiresOn,
    })),
    roadTaxes: roadTaxRows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      year: row.year,
      paidAt: row.paidAt,
    })),
    permits: permitRows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      expiresOn: row.expiresOn,
    })),
    maintenance: maintenanceRows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicleId,
      kind: row.kind,
      nextDueOn: row.nextDueOn,
      nextDueKm: row.nextDueKm,
    })),
    contracts: contractRows.map((row) => ({
      id: row.id,
      reference: row.reference,
      vehicleId: row.vehicleId,
      // Départ RÉEL si connu : une infraction entre le départ prévu et la remise
      // effective des clés n'est pas du fait du client (même règle que les amendes).
      startAt: row.actualStartAt ?? row.plannedStartAt,
      plannedEndAt: row.plannedEndAt,
      actualEndAt: row.actualEndAt,
      status: row.status,
      depositCents: row.depositCents,
      depositReturnedAt: row.depositReturnedAt,
    })),
    customers: customerRows.map((row) => ({
      id: row.id,
      label: [row.firstName, row.lastName].filter(Boolean).join(' ') || (row.companyName ?? row.id),
      licenceExpiresOn: row.licenceExpiresOn,
    })),
  }
}

export async function runAlertScan(db: Db, ctx: TenantContext): Promise<AlertScanResult> {
  const snapshot = await readAlertSnapshot(db, ctx)
  const drafts = evaluateAlerts(snapshot)
  return syncAlerts(db, ctx, drafts, snapshot.now)
}

/**
 * Réconcilie la base avec ce que le moteur veut.
 *
 * L'idempotence ne repose PAS sur ce code mais sur l'index unique
 * `(org_id, entity_type, entity_id, alert_type, threshold_key, period_key)`.
 * `onConflictDoNothing` est la traduction de « relancer ne crée rien ».
 */
export async function syncAlerts(
  db: Db,
  ctx: TenantContext,
  drafts: ReadonlyArray<AlertDraft>,
  now: string,
): Promise<AlertScanResult> {
  const repository = alertRepository(db, ctx)
  const existing = await repository.list()

  const wanted = new Map(drafts.map((draft) => [identityOf(draft), draft]))
  const byIdentity = new Map(
    existing.map((row) => [
      [row.entityType, row.entityId, row.alertType, row.thresholdKey, row.periodKey].join('|'),
      row,
    ]),
  )

  // 1. Ce qui est voulu et n'existe pas encore.
  const missing = drafts.filter((draft) => !byIdentity.has(identityOf(draft)))
  const created = await repository.createMissing(
    missing.map((draft) => ({
      entityType: draft.entityType,
      entityId: draft.entityId,
      alertType: draft.alertType,
      thresholdKey: draft.thresholdKey,
      periodKey: draft.periodKey,
      severity: draft.severity,
      dueOn: draft.dueOn ?? null,
      payloadJson: draft.payload ? JSON.stringify(draft.payload) : null,
      firstSeenAt: now,
      lastSeenAt: now,
    })),
  )

  // 2. Ce qui est voulu et existe : on rafraîchit sa dernière observation.
  const stillWanted = existing.filter((row) =>
    wanted.has(
      [row.entityType, row.entityId, row.alertType, row.thresholdKey, row.periodKey].join('|'),
    ),
  )
  const refreshed = await repository.touchLastSeen(
    stillWanted.map((row) => row.id),
    now,
  )

  /*
   * 3. Ce qui n'est plus voulu se referme.
   *
   * Deux cas, et ils comptent autant l'un que l'autre :
   *  - la cause a disparu (vignette payée, police renouvelée) ;
   *  - un seuil PLUS GRAVE de la même échéance est apparu — à J-7, l'alerte J-30
   *    n'a plus rien à dire, et la laisser ouverte transforme le centre en tas.
   */
  const wantedDeadlines = new Set(drafts.map(deadlineOf))
  const obsolete = existing.filter((row) => {
    if (row.state === 'resolved') return false
    const identity = [
      row.entityType,
      row.entityId,
      row.alertType,
      row.thresholdKey,
      row.periodKey,
    ].join('|')
    if (wanted.has(identity)) return false
    void wantedDeadlines
    return true
  })

  const resolved = await repository.resolve(
    obsolete.map((row) => row.id),
    now,
  )

  return { evaluated: drafts.length, created, refreshed, resolved }
}

/* --------------------------------------------------------------------- GPS */

/** Fenêtre d'observation du GPS. Au-delà, le fait est trop vieux pour être une alerte. */
const GPS_EXIT_WINDOW_MS = 7 * 24 * 3_600_000
const GPS_MOVEMENT_WINDOW_MS = 36 * 3_600_000

/**
 * Ce que le GPS apporte au moteur d'alertes — et rien de plus.
 *
 * Les faits sont AGRÉGÉS ici, au bord, pour deux raisons. D'abord parce que le jour
 * civil d'un relevé est un jour à Casablanca, et que le moteur, pur, ne connaît aucun
 * fuseau. Ensuite parce qu'un instantané d'alertes ne doit pas transporter quarante
 * mille positions : il en transporte une par véhicule et par jour.
 */
async function readGpsFacts(
  db: Db,
  ctx: TenantContext,
  now: Date,
): Promise<Pick<AlertSnapshot, 'geofenceExits' | 'gpsMovements'>> {
  const devices = await gpsDeviceRepository(db, ctx).listActive()
  const vehicleByDevice = new Map(
    devices.filter((device) => device.vehicleId).map((device) => [device.id, device.vehicleId!]),
  )

  const zones = new Map(
    (await geofenceRepository(db, ctx).list()).map((zone) => [zone.id, zone.name]),
  )

  const events = await geofenceEventRepository(db, ctx).since(
    new Date(now.getTime() - GPS_EXIT_WINDOW_MS).toISOString(),
  )

  const geofenceExits = events
    .filter((event) => event.kind === 'exit')
    .map((event) => ({
      id: event.id,
      vehicleId: event.vehicleId,
      geofenceName: zones.get(event.geofenceId) ?? event.geofenceId,
      occurredAt: event.occurredAt,
      onDay: businessCivilDate(new Date(event.occurredAt)),
    }))

  const moving = await gpsPositionRepository(db, ctx).movingSince(
    new Date(now.getTime() - GPS_MOVEMENT_WINDOW_MS).toISOString(),
    MOVING_KMH,
  )

  // Un relevé par véhicule et par jour : le premier, celui qui date l'événement.
  const firstOfDay = new Map<string, AlertSnapshot['gpsMovements'][number]>()
  for (const position of moving) {
    const vehicleId = vehicleByDevice.get(position.deviceId)
    if (!vehicleId) continue

    const onDay = businessCivilDate(new Date(position.recordedAt))
    const key = `${vehicleId}|${onDay}`
    if (firstOfDay.has(key)) continue

    firstOfDay.set(key, {
      vehicleId,
      at: position.recordedAt,
      onDay,
      speedKmh: position.speedKmh ?? MOVING_KMH,
    })
  }

  return { geofenceExits, gpsMovements: [...firstOfDay.values()] }
}
