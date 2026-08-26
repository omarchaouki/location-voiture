import type { CivilDate } from '../dates'

/**
 * MOTEUR D'ALERTES — types.
 *
 * Le moteur est PUR : ni React, ni Drizzle, ni `Date.now()`. Il reçoit un instantané
 * et une date de référence, il renvoie des intentions. C'est ce qui le rend rejouable,
 * testable à dates figées, et exécutable aussi bien dans un `node-cron` que dans une
 * Edge Function Supabase — la même logique, pas une copie.
 */

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical' | 'blocking'

export type AlertEntityType = 'vehicle' | 'contract' | 'customer' | 'branch' | 'organization'

/**
 * Une alerte VOULUE. Le moteur ne persiste rien : il décrit ce qui devrait exister.
 *
 * L'identité `(entityType, entityId, alertType, thresholdKey, periodKey)` est ce qui
 * garantit l'idempotence — portée par un index unique en base, pas par du code.
 * `periodKey` est l'écart É5 : sans lui, une alerte résolue ne pourrait jamais être
 * réémise l'année suivante après renouvellement du document.
 */
export interface AlertDraft {
  entityType: AlertEntityType
  entityId: string
  alertType: string
  thresholdKey: string
  periodKey: string
  severity: AlertSeverity
  dueOn?: CivilDate
  /** De quoi afficher la ligne sans re-requêter l'entité. */
  payload?: Record<string, string | number | null>
}

/* ------------------------------------------------------------------ entrée */

export interface AlertSnapshotVehicle {
  id: string
  plate: string
  label: string
  currentKm: number
  /** available | rented | maintenance | out_of_service | sold. */
  status: string
}

export interface AlertSnapshot {
  /** Date civile de référence, à Casablanca. Jamais lue depuis l'horloge du moteur. */
  today: CivilDate
  /** Instant de référence, pour les règles horaires (fin de contrat, retard). */
  now: string

  vehicles: ReadonlyArray<AlertSnapshotVehicle>

  insurance: ReadonlyArray<{ id: string; vehicleId: string; expiresOn: CivilDate }>
  inspections: ReadonlyArray<{ id: string; vehicleId: string; expiresOn: CivilDate }>
  /** Vignette : une ligne par véhicule et par année. `paidAt` nul = due. */
  roadTaxes: ReadonlyArray<{
    id: string
    vehicleId: string
    year: number
    paidAt: CivilDate | null
  }>
  permits: ReadonlyArray<{ id: string; vehicleId: string | null; expiresOn: CivilDate }>
  maintenance: ReadonlyArray<{
    id: string
    vehicleId: string
    kind: string
    nextDueOn: CivilDate | null
    nextDueKm: number | null
  }>
  /**
   * Sorties de zone déjà CONSTATÉES par l'ingestion GPS.
   *
   * Le moteur ne détecte pas les franchissements — c'est le travail de
   * `src/core/geofencing.ts`, au moment de l'ingestion, parce qu'il faut la trace
   * complète et non un instantané. Le moteur ne fait qu'en tirer une alerte.
   */
  geofenceExits: ReadonlyArray<{
    id: string
    vehicleId: string
    geofenceName: string
    occurredAt: string
    /** Jour civil À CASABLANCA, calculé au bord. */
    onDay: CivilDate
  }>

  /** Relevés en MOUVEMENT, un par véhicule et par jour civil (voir alert-scan). */
  gpsMovements: ReadonlyArray<{
    vehicleId: string
    at: string
    onDay: CivilDate
    speedKmh: number
  }>

  contracts: ReadonlyArray<{
    id: string
    reference: string
    vehicleId: string
    /** Départ réel si connu, sinon départ prévu — même convention que les amendes. */
    startAt: string
    plannedEndAt: string
    actualEndAt: string | null
    status: string
    depositCents: number
    depositReturnedAt: string | null
  }>
  customers: ReadonlyArray<{
    id: string
    label: string
    licenceExpiresOn: CivilDate | null
  }>
}

/** Une règle : un type d'alerte, ses seuils, sa sévérité, sa fonction d'évaluation. */
export interface AlertRule {
  type: string
  severity: AlertSeverity
  evaluate(snapshot: AlertSnapshot): AlertDraft[]
}
