import { and, eq, inArray } from 'drizzle-orm'

import { formatPlate, parsePlate } from '~/core/plate'
import type { Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { vehicleRepository, type VehicleRow } from '~/db/repositories/vehicles'
import { alerts } from '~/db/schema/alerts'
import type { TenantContext } from '~/db/tenant'
import type { NextDeadline, VehicleListRow, VehicleSummary } from '../vehicles'

/**
 * LECTURES — les fonctions que les tests mesurent.
 *
 * Elles vivent à part des modules de server functions, et ce n'est pas un rangement :
 * un module importé par une route ne doit exporter QUE des server functions. Le corps
 * d'un `.handler()` est remplacé par un appel réseau côté client ; une fonction
 * exportée, non — elle emporte ses imports jusque dans le navigateur.
 *
 * C'est exactement ce qui a fait tomber l'application le 25/08/2026 : une lecture
 * extraite pour être mesurable a traîné `better-sqlite3` dans le paquet client, React
 * n'a plus pu s'hydrater, et le formulaire de connexion est reparti en GET avec le mot
 * de passe dans l'URL. Voir docs/DECISIONS.md §13.7.
 */

type AlertRow = typeof alerts.$inferSelect

function toSummary(row: VehicleRow): VehicleSummary {
  const parsed = parsePlate(row.plate)
  return {
    id: row.id,
    plate: parsed ? formatPlate(parsed) : row.plate,
    make: row.make,
    model: row.model,
    year: row.year,
    status: row.status,
    currentKm: row.currentKm,
    dailyCents: row.dailyCents,
    photoPath: row.photoPath,
  }
}

/** Gravité décroissante. La colonne d'échéance montre LA plus urgente, pas la première. */
const SEVERITY_RANK: Record<string, number> = {
  blocking: 5,
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

/** Une alerte traitée ou résolue n'est plus une échéance à afficher. */
const LIVE_ALERT_STATES = ['open', 'snoozed']

/**
 * La liste des véhicules, échéance comprise — en DEUX requêtes, quelle que soit la
 * taille de la flotte.
 *
 * C'est le N+1 que le cahier des charges interdit nommément (docs/DOMAIN.md §7) :
 * « la liste des véhicules affiche pour chacun sa prochaine échéance ; écrite
 * naïvement, c'est une requête par véhicule ». On lit donc les alertes vivantes en
 * UN balayage d'index et on les rapproche en mémoire. Quarante voitures, deux
 * requêtes ; quatre cents voitures, toujours deux.
 *
 * `tests/unit/queries.test.ts` compte les requêtes et échoue si ce nombre bouge avec
 * la flotte — une interdiction que personne ne vérifie n'est pas une interdiction.
 *
 * Extraite du gestionnaire de server function pour être mesurable : un `createServerFn`
 * ne s'appelle pas depuis un test sans requête HTTP.
 */
export async function readVehicleList(db: Db, ctx: TenantContext): Promise<VehicleListRow[]> {
  const rows = await vehicleRepository(db, ctx).list()
  if (rows.length === 0) return []

  const openAlerts = await forOrg<AlertRow>(db, ctx, alerts).list(
    and(eq(alerts.entityType, 'vehicle'), inArray(alerts.state, LIVE_ALERT_STATES)),
  )

  const mostUrgent = new Map<string, NextDeadline>()
  for (const alert of openAlerts) {
    const known = mostUrgent.get(alert.entityId)
    if (known && !isMoreUrgent(alert, known)) continue
    mostUrgent.set(alert.entityId, {
      alertType: alert.alertType,
      severity: alert.severity,
      dueOn: alert.dueOn,
    })
  }

  return rows
    .sort((a, b) => a.plateNormalized.localeCompare(b.plateNormalized))
    .map((row) => ({ ...toSummary(row), nextDeadline: mostUrgent.get(row.id) ?? null }))
}

/** Plus grave d'abord ; à gravité égale, la plus proche. Une échéance sans date passe après. */
function isMoreUrgent(candidate: AlertRow, current: NextDeadline): boolean {
  const rank = (SEVERITY_RANK[candidate.severity] ?? 0) - (SEVERITY_RANK[current.severity] ?? 0)
  if (rank !== 0) return rank > 0
  if (candidate.dueOn === null) return false
  if (current.dueOn === null) return true
  return candidate.dueOn < current.dueOn
}
