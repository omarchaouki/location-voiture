import { and, gte, lte } from 'drizzle-orm'

import { addCivilDays } from '~/core/dates'
import type { Db } from '~/db/client'
import { alertRepository } from '~/db/repositories/alerts'
import { forOrg } from '~/db/repositories/base'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { contracts } from '~/db/schema/contracts'
import { customers } from '~/db/schema/customers'
import { revenues } from '~/db/schema/finance'
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

/**
 * Un retour attendu, prêt à afficher.
 *
 * La ligne porte le nom du client et la plaque, pas des identifiants : un retour se
 * prépare en sortant le dossier et en regardant la place de parking, pas en cherchant
 * un UUID dans une autre page.
 */
export interface ExpectedReturn {
  contractId: string
  reference: string
  plate: string
  vehicleLabel: string
  customerLabel: string
  endAt: string
  /** Le retour aurait dû avoir lieu : la ligne change de ton, pas seulement de place. */
  late: boolean
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
    /** Départs prévus aujourd'hui : l'autre moitié de la journée. */
    startingToday: number
    /** Contrats non soldés. Un COMPTE, pas un montant — voir `money`. */
    unpaid: number
  }
  /**
   * CE QUI RENTRE, sur trois jours.
   *
   * C'est la demande la plus concrète d'un loueur : savoir ce soir quelles voitures
   * il récupère demain, pour promettre une réservation sans se tromper. Le compteur
   * « retours aujourd'hui » ne suffisait pas — il répond au matin, pas à la veille.
   */
  returns: {
    today: ExpectedReturn[]
    tomorrow: ExpectedReturn[]
    dayAfter: ExpectedReturn[]
  }
  customers: {
    total: number
    /** Permis qui expire dans les trente jours, ou déjà expiré. Bloque une signature. */
    licenceExpiring: number
  }
  money: {
    /** Encaissé depuis le 1er du mois, toutes catégories. Exact, lu dans `revenues`. */
    collectedThisMonthCents: number
    currency: string
  }
  /** Part de la flotte dehors, en pourcentage entier. La mesure d'un loueur. */
  utilisation: number
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

/** Étiquette d'un client : raison sociale, ou nom complet, ou rien plutôt qu'un vide. */
function customerLabel(row: {
  companyName: string | null
  firstName: string | null
  lastName: string | null
}): string {
  const person = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
  return row.companyName ?? (person.length > 0 ? person : '—')
}

export async function readAgencyOverview(
  db: Db,
  ctx: TenantContext,
  now: Date = new Date(),
): Promise<AgencyOverview> {
  const today = businessCivilDate(now)
  const tomorrow = addCivilDays(today, 1)
  const dayAfter = addCivilDays(today, 2)
  const monthStart = `${today.slice(0, 7)}-01`
  const licenceHorizon = addCivilDays(today, 30)

  const customerRepository = forOrg<typeof customers.$inferSelect>(db, ctx, customers)

  const [vehicles, rentals, alerts, clientRows, monthRevenues] = await Promise.all([
    vehicleRepository(db, ctx).list(),
    forOrg<typeof contracts.$inferSelect>(db, ctx, contracts).list(),
    alertRepository(db, ctx).live(),
    customerRepository.list(),
    /*
      Les recettes sont filtrées EN SQL sur le mois courant. Une agence de trois ans a
      des milliers de lignes ; les lire toutes pour en additionner trente ferait
      grossir la page d'accueil avec l'âge du client — le défaut déjà corrigé sur les
      alertes.
    */
    forOrg<typeof revenues.$inferSelect>(db, ctx, revenues).list(
      and(gte(revenues.receivedOn, monthStart), lte(revenues.receivedOn, today)),
    ),
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

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))
  const clientById = new Map(clientRows.map((client) => [client.id, client]))

  const counts = {
    active: 0,
    late: 0,
    dueToday: 0,
    upcoming: 0,
    startingToday: 0,
    unpaid: 0,
  }
  const returns = {
    today: [] as ExpectedReturn[],
    tomorrow: [] as ExpectedReturn[],
    dayAfter: [] as ExpectedReturn[],
  }

  for (const contract of rentals) {
    if (contract.status === 'active') counts.active += 1
    else if (contract.status === 'late') counts.late += 1
    else if (contract.status === 'reservation') counts.upcoming += 1

    if (
      contract.status !== 'cancelled' &&
      contract.status !== 'closed' &&
      contract.paymentStatus !== 'paid'
    ) {
      counts.unpaid += 1
    }

    /*
     * Les dates se comparent en DATE CIVILE de Casablanca, jamais en instant.
     * `planned_end_at` est un instant UTC ; le découper avec `slice(0, 10)` donnerait
     * la date UTC, qui n'est pas la date locale une partie de l'année — et un retour
     * prévu à 00 h 30 disparaîtrait du tableau du matin (docs/DECISIONS.md É7).
     */
    if (contract.plannedStartAt && businessCivilDate(new Date(contract.plannedStartAt)) === today) {
      if (contract.status === 'reservation') counts.startingToday += 1
    }

    const open = contract.status === 'active' || contract.status === 'late'
    if (!open || !contract.plannedEndAt) continue

    const endDay = businessCivilDate(new Date(contract.plannedEndAt))
    const bucket =
      endDay === today
        ? returns.today
        : endDay === tomorrow
          ? returns.tomorrow
          : endDay === dayAfter
            ? returns.dayAfter
            : null
    if (!bucket) continue

    if (endDay === today) counts.dueToday += 1

    const vehicle = vehicleById.get(contract.vehicleId)
    const client = clientById.get(contract.customerId)
    bucket.push({
      contractId: contract.id,
      reference: contract.reference,
      plate: vehicle?.plate ?? '—',
      vehicleLabel: vehicle ? `${vehicle.make} ${vehicle.model}` : '—',
      customerLabel: client ? customerLabel(client) : '—',
      endAt: contract.plannedEndAt,
      late: contract.status === 'late',
    })
  }

  // Le plus proche en tête, dans chacun des trois jours.
  for (const bucket of [returns.today, returns.tomorrow, returns.dayAfter]) {
    bucket.sort((a, b) => a.endAt.localeCompare(b.endAt))
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

  const licenceExpiring = clientRows.filter(
    (client) => client.licenceExpiresOn !== null && client.licenceExpiresOn <= licenceHorizon,
  ).length

  const collectedThisMonthCents = monthRevenues.reduce((total, row) => total + row.amountCents, 0)

  return {
    fleet,
    contracts: counts,
    returns,
    customers: { total: clientRows.length, licenceExpiring },
    money: {
      collectedThisMonthCents,
      // La devise vient des lignes, pas d'une constante : une agence peut encaisser
      // en euros pour un client étranger, et afficher « MAD » serait faux.
      currency: monthRevenues[0]?.currency ?? 'MAD',
    },
    utilisation: fleet.total === 0 ? 0 : Math.round((fleet.rented / fleet.total) * 100),
    alerts: {
      critical: live.filter((alert) => alert.severity === CRITICAL).length,
      warning: live.filter((alert) => alert.severity === WARNING).length,
      total: live.length,
      soonest,
    },
  }
}
