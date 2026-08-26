import { eq } from 'drizzle-orm'

import type { Db } from '../client'
import {
  insurancePolicies,
  permits,
  registrationDocs,
  roadTaxes,
  technicalInspections,
} from '../schema/documents'
import { maintenanceSchedules } from '../schema/maintenance'
import type { TenantContext } from '../tenant'
import { forOrg } from './base'

/**
 * Documents administratifs du véhicule.
 *
 * Tous construits par `forOrg` : aucun n'expose de fonction sans `TenantContext`, et
 * tous entrent automatiquement dans `tests/unit/tenant-isolation.test.ts`.
 */

export type InsuranceRow = typeof insurancePolicies.$inferSelect
export type InspectionRow = typeof technicalInspections.$inferSelect
export type RoadTaxRow = typeof roadTaxes.$inferSelect
export type RegistrationRow = typeof registrationDocs.$inferSelect
export type PermitRow = typeof permits.$inferSelect
export type MaintenanceScheduleRow = typeof maintenanceSchedules.$inferSelect

export function documentRepositories(db: Db, ctx: TenantContext) {
  const insurance = forOrg<InsuranceRow>(db, ctx, insurancePolicies)
  const inspection = forOrg<InspectionRow>(db, ctx, technicalInspections)
  const roadTax = forOrg<RoadTaxRow>(db, ctx, roadTaxes)
  const registration = forOrg<RegistrationRow>(db, ctx, registrationDocs)
  const permit = forOrg<PermitRow>(db, ctx, permits)
  const maintenance = forOrg<MaintenanceScheduleRow>(db, ctx, maintenanceSchedules)

  return {
    insurance,
    inspection,
    roadTax,
    registration,
    permit,
    maintenance,

    /** Police en cours d'un véhicule. Les précédentes restent en historique. */
    currentInsurance: async (vehicleId: string) => {
      const rows = await insurance.list(eq(insurancePolicies.vehicleId, vehicleId))
      return rows.find((row) => row.isCurrent) ?? null
    },

    currentInspection: async (vehicleId: string) => {
      const rows = await inspection.list(eq(technicalInspections.vehicleId, vehicleId))
      return rows.find((row) => row.isCurrent) ?? null
    },

    /** Vignette de l'année demandée — une ligne par véhicule et par année (É3). */
    roadTaxForYear: async (vehicleId: string, year: number) => {
      const rows = await roadTax.list(eq(roadTaxes.vehicleId, vehicleId))
      return rows.find((row) => row.year === year) ?? null
    },

    registrationOf: async (vehicleId: string) => {
      const rows = await registration.list(eq(registrationDocs.vehicleId, vehicleId))
      return rows[0] ?? null
    },

    schedulesOf: async (vehicleId: string) => {
      const rows = await maintenance.list(eq(maintenanceSchedules.vehicleId, vehicleId))
      return rows.filter((row) => row.isActive)
    },
  }
}
