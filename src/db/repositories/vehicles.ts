import { eq } from 'drizzle-orm'

import { normalizePlateInput } from '~/core/plate'
import type { Db } from '../client'
import { vehicles } from '../schema/vehicles'
import type { TenantContext } from '../tenant'
import { forOrg } from './base'

export type VehicleRow = typeof vehicles.$inferSelect
export type VehicleInsert = typeof vehicles.$inferInsert

/** Levée quand la plaque saisie n'a pas une forme marocaine reconnue. */
export class InvalidPlateError extends Error {
  constructor(readonly input: string) {
    super(`invalid plate: ${input}`)
    this.name = 'InvalidPlateError'
  }
}

/**
 * Repository des véhicules.
 *
 * Comme tous les repositories, il se construit avec un `TenantContext` et n'expose
 * aucune fonction capable de lire hors de l'organisation.
 */
export function vehicleRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<VehicleRow>(db, ctx, vehicles)

  return {
    ...base,

    /**
     * La plaque est normalisée AVANT insertion : c'est `plate_normalized` qui porte
     * l'unicité `(org_id, plate_normalized)`, et une saisie `12345 A 6` doit entrer
     * en collision avec `12345|أ|6`.
     */
    async create(values: Omit<VehicleInsert, 'orgId' | 'plateNormalized'>): Promise<VehicleRow> {
      const normalized = normalizePlateInput(values.plate)
      if (normalized === null) throw new InvalidPlateError(values.plate)
      return base.insert({ ...values, plateNormalized: normalized })
    },

    async updatePlate(id: string, plate: string): Promise<VehicleRow | undefined> {
      const normalized = normalizePlateInput(plate)
      if (normalized === null) throw new InvalidPlateError(plate)
      return base.update(id, { plate, plateNormalized: normalized })
    },

    /**
     * Recherche par plaque, quelle que soit la forme saisie.
     *
     * Elle passe par `base.list()` et non par une requête écrite à la main : c'est
     * `list()` qui applique le filtre d'organisation. Deux clients peuvent avoir la
     * même plaque en base — une requête « juste sur la plaque » ferait fuiter une
     * fiche, et c'est précisément le genre d'oubli qu'aucune signature de ce module
     * ne doit rendre possible.
     */
    async findByPlate(input: string): Promise<VehicleRow | undefined> {
      const normalized = normalizePlateInput(input)
      if (normalized === null) return undefined
      const rows = await base.list(eq(vehicles.plateNormalized, normalized))
      return rows[0]
    },
  }
}
