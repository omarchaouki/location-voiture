import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { bool, civilDate, orgColumns, timestamp } from './_shared'

/**
 * GPS.
 *
 * `gps_positions` est la seule table à fort volume du produit. Elle est
 * partitionnable par mois en Postgres, avec une rétention par défaut de 12 mois
 * configurable par plan.
 *
 * Le seul chemin par lequel le GPS influence le métier est le kilométrage :
 * la distance quotidienne calculée alimente `vehicles.current_km`, qui alimente
 * les alertes de vidange.
 *
 * Exception assumée à la charte : `lat`/`lng` sont des `real`. Ce sont des mesures
 * physiques, pas de l'argent ; les stocker en entier de micro-degrés compliquerait
 * chaque calcul de distance sans rien protéger.
 */

export const gpsDevices = sqliteTable(
  'gps_devices',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id'),
    /** traccar | mock */
    provider: text('provider').notNull().default('mock'),
    externalId: text('external_id').notNull(),
    imei: text('imei'),
    simNumber: text('sim_number'),
    installedOn: civilDate('installed_on'),
    isActive: bool('is_active').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at'),
  },
  (table) => [
    index('gps_devices_org_idx').on(table.orgId, table.isActive),
    index('gps_devices_vehicle_idx').on(table.orgId, table.vehicleId),
  ],
)

export const gpsPositions = sqliteTable(
  'gps_positions',
  {
    ...orgColumns,
    deviceId: text('device_id').notNull(),
    recordedAt: timestamp('recorded_at').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    speedKmh: real('speed_kmh'),
    heading: real('heading'),
    ignition: bool('ignition'),
    odometerKm: integer('odometer_km'),
    rawJson: text('raw_json'),
  },
  (table) => [
    index('gps_positions_device_time_idx').on(table.orgId, table.deviceId, table.recordedAt),
    /*
     * L'IDEMPOTENCE DE L'INGESTION, portée par un index et non par du code.
     *
     * Un fournisseur GPS renvoie les mêmes positions à chaque appel dès qu'on
     * redemande une fenêtre déjà vue — après un redémarrage, une reprise sur erreur,
     * ou simplement parce que deux tâches se chevauchent. `onConflictDoNothing` sur
     * cet index est la traduction de « rejouer ne crée rien ».
     */
    uniqueIndex('gps_positions_unique').on(table.orgId, table.deviceId, table.recordedAt),
  ],
)

/**
 * Kilomètres par véhicule et par JOUR — une pré-agrégation, pas une donnée nouvelle.
 *
 * Elle existe pour une raison de performance, et elle est assumée comme telle :
 * répondre à « combien de kilomètres par jour sur les 90 derniers jours ? » depuis
 * `gps_positions` demanderait de relire jusqu'à 270 000 points pour un seul véhicule
 * et une seule frise. Ici, c'est au plus 90 lignes.
 *
 * Elle a un second mérite, qui n'était pas le but : elle **survit à la purge**. Les
 * positions sont jetées au bout d'un an (src/server/gps/retention.ts), le kilométrage
 * quotidien reste. On jette la matière première, on garde ce qu'on en a conclu.
 *
 * `(org_id, vehicle_id, on_day)` est UNIQUE : le calcul est donc rejouable, comme
 * tout le reste de l'ingestion.
 */
export const vehicleDailyKm = sqliteTable(
  'vehicle_daily_km',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    /** Jour civil À CASABLANCA, jamais un jour UTC. */
    onDay: civilDate('on_day').notNull(),
    km: integer('km').notNull().default(0),
    /** gps | contract — d'où vient la mesure. */
    source: text('source').notNull().default('gps'),
  },
  (table) => [
    uniqueIndex('vehicle_daily_km_unique').on(table.orgId, table.vehicleId, table.onDay),
    index('vehicle_daily_km_idx').on(table.orgId, table.vehicleId, table.onDay),
  ],
)

export const geofences = sqliteTable(
  'geofences',
  {
    ...orgColumns,
    name: text('name').notNull(),
    /** circle | polygon */
    kind: text('kind').notNull().default('circle'),
    geometryJson: text('geometry_json').notNull(),
    radiusM: integer('radius_m'),
    /** all | vehicle | category */
    appliesTo: text('applies_to').notNull().default('all'),
    appliesToValue: text('applies_to_value'),
    isActive: bool('is_active').notNull().default(true),
  },
  (table) => [index('geofences_org_idx').on(table.orgId, table.isActive)],
)

export const geofenceEvents = sqliteTable(
  'geofence_events',
  {
    ...orgColumns,
    geofenceId: text('geofence_id').notNull(),
    vehicleId: text('vehicle_id').notNull(),
    /** enter | exit */
    kind: text('kind').notNull(),
    occurredAt: timestamp('occurred_at').notNull(),
    positionId: text('position_id'),
  },
  (table) => [
    index('geofence_events_idx').on(table.orgId, table.vehicleId, table.occurredAt),
    // Même raison que pour les positions : rejouer une fenêtre déjà ingérée ne doit
    // pas ajouter une seconde fois la même sortie de zone.
    uniqueIndex('geofence_events_unique').on(
      table.orgId,
      table.geofenceId,
      table.vehicleId,
      table.occurredAt,
    ),
  ],
)
