import type { Db } from '~/db/client'
import { alertRepository } from '~/db/repositories/alerts'
import { forOrg } from '~/db/repositories/base'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { contracts } from '~/db/schema/contracts'
import type { TenantContext } from '~/db/tenant'
import { businessCivilDate } from '~/i18n/format'

/**
 * LECTURE du tableau de bord de l'agence — hors du module de server functions,
 * comme les autres lectures mesurables (docs/DECISIONS.md §13.7).
 *
 * L'écran d'accueil affichait une page vide avec un bouton « se déconnecter ». Il
 * répond maintenant aux trois questions qu'un loueur se pose en ouvrant son bureau :
 *
 *  1. où sont mes voitures — dehors, disponibles, à l'atelier ;
 *  2. qu'est-ce qui rentre aujourd'hui, et qu'est-ce qui aurait dû rentrer hier ;
 *  3. qu'est-ce qui va me coûter cher si je l'oublie cette semaine.
 *
 * TROIS requêtes, quelle que soit la taille de l'agence : la flotte, les contrats,
 * les alertes vivantes. Le rapprochement se fait en mémoire — une flotte plafonne à
 * quelques dizaines de voitures par le quota de l'offre, et un `group by` par état
 * coûterait une requête de plus pour un gain nul.
 */

export interface OverviewAlert {
  id: string
  alertType: string
  severity: string
  dueOn: string | null
  entityType: string
  entityId: string
}

export interface AgencyOverview {
  fleet: {
    total: number
    available: number
    rented: number
    maintenance: number
    outOfService: number
  }
  contracts: {
    active: number
    late: number
    /** Retours prévus aujourd'hui — la question du matin. */
    dueToday: number
    /** Réservations qui n'ont pas encore démarré. */
    upcoming: number
  }
  alerts: {
    critical: number
    warning: number
    total: number
    /** Les cinq plus proches. La liste complète est sur `/alertes`. */
    soonest: OverviewAlert[]
  }
}

/** Sévérités du moteur d'alertes. `critical` est la seule qui a le droit d'interrompre. */
const CRITICAL = 'critical'
const WARNING = 'warning'

export async function readAgencyOverview(
  db: Db,
  ctx: TenantContext,
  now: Date = new Date(),
): Promise<AgencyOverview> {
  const today = businessCivilDate(now)

  const [vehicles, rentals, alerts] = await Promise.all([
    vehicleRepository(db, ctx).list(),
    forOrg<typeof contracts.$inferSelect>(db, ctx, contracts).list(),
    alertRepository(db, ctx).live(),
  ])

  const fleet = { total: 0, available: 0, rented: 0, maintenance: 0, outOfService: 0 }
  for (const vehicle of vehicles) {
    // `sold` ne fait plus partie de la flotte : la compter gonflerait le total sans
    // qu'aucune ligne de l'écran ne lui corresponde.
    if (vehicle.status === 'sold') continue
    fleet.total += 1
    if (vehicle.status === 'available') fleet.available += 1
    else if (vehicle.status === 'rented') fleet.rented += 1
    else if (vehicle.status === 'maintenance') fleet.maintenance += 1
    else if (vehicle.status === 'out_of_service') fleet.outOfService += 1
  }

  const counts = { active: 0, late: 0, dueToday: 0, upcoming: 0 }
  for (const contract of rentals) {
    if (contract.status === 'active') counts.active += 1
    else if (contract.status === 'late') counts.late += 1
    else if (contract.status === 'reservation') counts.upcoming += 1

    /*
     * Le retour du jour se compare en DATE CIVILE de Casablanca, pas en instant.
     * `planned_end_at` est un instant UTC ; le découper avec `slice(0, 10)` donnerait
     * la date UTC, qui n'est pas la date locale une partie de l'année — et un retour
     * prévu à 00 h 30 disparaîtrait du tableau du matin (docs/DECISIONS.md É7).
     */
    if (
      (contract.status === 'active' || contract.status === 'late') &&
      contract.plannedEndAt &&
      businessCivilDate(new Date(contract.plannedEndAt)) === today
    ) {
      counts.dueToday += 1
    }
  }

  const live = alerts.filter((alert) => alert.state !== 'resolved')
  const soonest = [...live]
    .sort((a, b) => (a.dueOn ?? '9999-12-31').localeCompare(b.dueOn ?? '9999-12-31'))
    .slice(0, 5)
    .map((alert) => ({
      id: alert.id,
      alertType: alert.alertType,
      severity: alert.severity,
      dueOn: alert.dueOn,
      entityType: alert.entityType,
      entityId: alert.entityId,
    }))

  return {
    fleet,
    contracts: counts,
    alerts: {
      critical: live.filter((alert) => alert.severity === CRITICAL).length,
      warning: live.filter((alert) => alert.severity === WARNING).length,
      total: live.length,
      soonest,
    },
  }
}
