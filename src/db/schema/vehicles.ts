import { index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

import { aliveOnly, cents, civilDate, orgColumns, timestamp } from './_shared'

export const vehicles = pgTable(
  'vehicles',
  {
    ...orgColumns,
    branchId: text('branch_id'),

    /** Forme d'affichage, ex. `12345 | أ | 6`. À rendre TOUJOURS isolée en bidi. */
    plate: text('plate').notNull(),
    /** Clé de recherche et d'unicité, ex. `12345A6`. Voir src/core/plate.ts. */
    plateNormalized: text('plate_normalized').notNull(),

    vin: text('vin'),
    make: text('make').notNull(),
    model: text('model').notNull(),
    trim: text('trim'),
    year: integer('year'),
    color: text('color'),
    /** citadine | compacte | berline | suv | utilitaire | premium */
    category: text('category'),
    /** essence | diesel | hybride | electrique */
    fuel: text('fuel'),
    /** manuelle | automatique */
    gearbox: text('gearbox'),
    seats: integer('seats'),
    doors: integer('doors'),

    currentKm: integer('current_km').notNull().default(0),
    /** Sans cette date, le kilométrage projeté d'une vidange ne veut rien dire. */
    currentKmAt: timestamp('current_km_at'),

    /** available | rented | maintenance | out_of_service | sold — dérivé mais stocké. */
    status: text('status').notNull().default('available'),

    acquiredOn: civilDate('acquired_on'),
    acquisitionCents: cents('acquisition_cents'),
    /** cash | credit | leasing | lld */
    financing: text('financing'),

    dailyCents: cents('daily_cents'),
    weeklyCents: cents('weekly_cents'),
    monthlyCents: cents('monthly_cents'),
    depositCents: cents('deposit_cents'),
    currency: text('currency').notNull().default('MAD'),

    notes: text('notes'),
  },
  (table) => [
    // Unicité de la plaque par organisation, sur les lignes vivantes uniquement :
    // un véhicule vendu ne doit pas bloquer la ressaisie de sa plaque.
    uniqueIndex('vehicles_plate_unique')
      .on(table.orgId, table.plateNormalized)
      .where(aliveOnly),
    index('vehicles_org_idx').on(table.orgId, table.deletedAt),
    index('vehicles_status_idx').on(table.orgId, table.status),
    index('vehicles_branch_idx').on(table.orgId, table.branchId),
  ],
)

export const vehiclePhotos = pgTable(
  'vehicle_photos',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id').notNull(),
    path: text('path').notNull(),
    /** front | rear | side | interior | damage */
    kind: text('kind').notNull().default('side'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('vehicle_photos_vehicle_idx').on(table.orgId, table.vehicleId)],
)
