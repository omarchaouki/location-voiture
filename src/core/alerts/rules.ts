import { civilDaysBetween, civilDateOfIso, type CivilDate } from '../dates'
import { unauthorizedMovements } from '../tracking'
import { expiryThreshold, hoursSince, latenessThreshold, type ExpiryThresholds } from './thresholds'
import type { AlertDraft, AlertRule, AlertSnapshot } from './types'

/**
 * LES RÈGLES — tableau du cahier des charges §10, une fonction par ligne.
 *
 * Chacune est pure et indépendante. Ajouter une règle, c'est ajouter un objet à la
 * liste du bas et un test à dates figées : voir `.claude/skills/alerts-rule`.
 */

const INSURANCE: ExpiryThresholds = { before: [30, 14, 7, 1], daily: true }
const INSPECTION: ExpiryThresholds = { before: [30, 14, 7], daily: true }
const PERMIT: ExpiryThresholds = { before: [60, 30, 7], daily: false }
const LICENCE: ExpiryThresholds = { before: [30, 7], daily: false }
const MAINTENANCE_DATE: ExpiryThresholds = { before: [30, 7], daily: false }

/** Kilomètres restants auxquels on prévient d'une échéance d'entretien. */
const MAINTENANCE_KM_THRESHOLDS = [1000, 500, 200] as const

function vehicleLabel(snapshot: AlertSnapshot, vehicleId: string): string {
  return snapshot.vehicles.find((vehicle) => vehicle.id === vehicleId)?.label ?? vehicleId
}

/* ------------------------------------------------------------- assurance */

export const insuranceExpiry: AlertRule = {
  type: 'insurance.expiry',
  severity: 'critical',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []
    for (const policy of snapshot.insurance) {
      const threshold = expiryThreshold(snapshot.today, policy.expiresOn, INSURANCE)
      if (!threshold) continue
      drafts.push({
        entityType: 'vehicle',
        entityId: policy.vehicleId,
        alertType: 'insurance.expiry',
        thresholdKey: threshold.key,
        // La date d'échéance EST la période : renouveler la police en crée une autre,
        // donc l'alerte pourra réapparaître l'an prochain. É5.
        periodKey: policy.expiresOn,
        severity: 'critical',
        dueOn: policy.expiresOn,
        payload: { vehicle: vehicleLabel(snapshot, policy.vehicleId), days: threshold.days },
      })
    }
    return drafts
  },
}

/* ------------------------------------------------------- visite technique */

export const inspectionExpiry: AlertRule = {
  type: 'inspection.expiry',
  severity: 'critical',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []
    for (const inspection of snapshot.inspections) {
      const threshold = expiryThreshold(snapshot.today, inspection.expiresOn, INSPECTION)
      if (!threshold) continue
      drafts.push({
        entityType: 'vehicle',
        entityId: inspection.vehicleId,
        alertType: 'inspection.expiry',
        thresholdKey: threshold.key,
        periodKey: inspection.expiresOn,
        severity: 'critical',
        dueOn: inspection.expiresOn,
        payload: { vehicle: vehicleLabel(snapshot, inspection.vehicleId), days: threshold.days },
      })
    }
    return drafts
  },
}

/* ---------------------------------------------------------------- vignette */

/**
 * Vignette : une CAMPAGNE annuelle, pas une échéance glissante (É3).
 *
 * Toute voiture sans paiement pour l'année en cours entre en alerte au 1er janvier,
 * monte jusqu'à la fin de la fenêtre, puis reste « en infraction » jusqu'au paiement.
 * C'est ce que vit un gérant en janvier : quarante vignettes à payer en un mois.
 */
const ROAD_TAX_WINDOW_END = 31

export const roadTaxCampaign: AlertRule = {
  type: 'roadtax.campaign',
  severity: 'high',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []
    const year = Number(snapshot.today.slice(0, 4))

    for (const roadTax of snapshot.roadTaxes) {
      if (roadTax.year !== year || roadTax.paidAt !== null) continue

      const deadline: CivilDate = `${year}-01-${ROAD_TAX_WINDOW_END}`
      const days = civilDaysBetween(snapshot.today, deadline)

      const key =
        days < 0 ? 'overdue' : days <= 3 ? 'window-end' : days <= 15 ? 'window-mid' : 'window-open'

      drafts.push({
        entityType: 'vehicle',
        entityId: roadTax.vehicleId,
        alertType: 'roadtax.campaign',
        thresholdKey: key,
        // La période est l'ANNÉE : la campagne suivante rouvrira une alerte.
        periodKey: String(roadTax.year),
        severity: days < 0 ? 'critical' : 'high',
        dueOn: deadline,
        payload: { vehicle: vehicleLabel(snapshot, roadTax.vehicleId), year: roadTax.year },
      })
    }
    return drafts
  },
}

/* ------------------------------------------------------------ autorisation */

export const permitExpiry: AlertRule = {
  type: 'permit.expiry',
  severity: 'high',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []
    for (const permit of snapshot.permits) {
      const threshold = expiryThreshold(snapshot.today, permit.expiresOn, PERMIT)
      if (!threshold) continue
      drafts.push({
        // Une autorisation d'exploitation vaut pour l'agence, pas pour une voiture.
        entityType: permit.vehicleId ? 'vehicle' : 'branch',
        entityId: permit.vehicleId ?? permit.id,
        alertType: 'permit.expiry',
        thresholdKey: threshold.key,
        periodKey: permit.expiresOn,
        severity: threshold.days < 0 ? 'critical' : 'high',
        dueOn: permit.expiresOn,
        payload: { days: threshold.days },
      })
    }
    return drafts
  },
}

/* ------------------------------------------------------- permis du client */

/**
 * Permis expiré : BLOQUANT à la signature (cahier des charges §10).
 * L'alerte existe pour que le gérant s'en aperçoive avant le client au comptoir.
 */
export const licenceExpiry: AlertRule = {
  type: 'licence.expiry',
  severity: 'blocking',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []
    for (const customer of snapshot.customers) {
      if (!customer.licenceExpiresOn) continue
      const threshold = expiryThreshold(snapshot.today, customer.licenceExpiresOn, LICENCE)
      if (!threshold) continue
      drafts.push({
        entityType: 'customer',
        entityId: customer.id,
        alertType: 'licence.expiry',
        thresholdKey: threshold.days < 0 ? 'expired' : threshold.key,
        periodKey: customer.licenceExpiresOn,
        severity: 'blocking',
        dueOn: customer.licenceExpiresOn,
        payload: { customer: customer.label, days: threshold.days },
      })
    }
    return drafts
  },
}

/* ----------------------------------------------------------------- contrats */

export const contractEnding: AlertRule = {
  type: 'contract.ending',
  severity: 'critical',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []
    for (const contract of snapshot.contracts) {
      if (contract.status !== 'active' && contract.status !== 'reservation') continue
      const endOn = civilDateOfIso(contract.plannedEndAt)
      const days = civilDaysBetween(snapshot.today, endOn)
      if (days < 0 || days > 1) continue

      drafts.push({
        entityType: 'contract',
        entityId: contract.id,
        alertType: 'contract.ending',
        thresholdKey: days === 0 ? 'd-0' : 'd-1',
        periodKey: endOn,
        severity: 'critical',
        dueOn: endOn,
        payload: { reference: contract.reference, vehicle: vehicleLabel(snapshot, contract.vehicleId) },
      })
    }
    return drafts
  },
}

/**
 * Retard de retour.
 *
 * `late` n'est jamais un statut saisi : c'est le moteur qui le constate. Un retard
 * doit être visible même si personne n'a ouvert l'application de la journée.
 */
export const contractLate: AlertRule = {
  type: 'contract.late',
  severity: 'critical',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []
    for (const contract of snapshot.contracts) {
      if (contract.actualEndAt !== null) continue
      if (contract.status !== 'active' && contract.status !== 'late') continue

      const hours = hoursSince(snapshot.now, contract.plannedEndAt)
      const key = hours >= 3 ? latenessThreshold(hours) : null
      if (!key) continue

      drafts.push({
        entityType: 'contract',
        entityId: contract.id,
        alertType: 'contract.late',
        thresholdKey: key,
        periodKey: civilDateOfIso(contract.plannedEndAt),
        severity: 'critical',
        dueOn: civilDateOfIso(contract.plannedEndAt),
        payload: { reference: contract.reference, hours },
      })
    }
    return drafts
  },
}

/** Caution non restituée 48 h après le retour. */
export const depositPending: AlertRule = {
  type: 'deposit.pending',
  severity: 'medium',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []
    for (const contract of snapshot.contracts) {
      if (!contract.actualEndAt) continue
      if (contract.depositCents <= 0) continue
      if (contract.depositReturnedAt !== null) continue
      if (hoursSince(snapshot.now, contract.actualEndAt) < 48) continue

      drafts.push({
        entityType: 'contract',
        entityId: contract.id,
        alertType: 'deposit.pending',
        thresholdKey: 'h-48',
        periodKey: civilDateOfIso(contract.actualEndAt),
        severity: 'medium',
        dueOn: civilDateOfIso(contract.actualEndAt),
        payload: { reference: contract.reference, amountCents: contract.depositCents },
      })
    }
    return drafts
  },
}

/* ---------------------------------------------------------------- entretien */

/**
 * Entretien : la règle se déclenche au PREMIER seuil atteint, kilomètres ou temps.
 *
 * Les deux bornes sont évaluées séparément et la plus urgente gagne. La borne
 * kilométrique est celle qui parle à un gérant ; la borne de temps rattrape les
 * voitures peu roulées, qu'on oublierait sinon pendant deux ans.
 */
export const maintenanceDue: AlertRule = {
  type: 'maintenance.due',
  severity: 'high',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []

    for (const schedule of snapshot.maintenance) {
      const vehicle = snapshot.vehicles.find((candidate) => candidate.id === schedule.vehicleId)
      if (!vehicle) continue

      const kmKey = kilometreThreshold(schedule.nextDueKm, vehicle.currentKm)
      const dateThreshold = schedule.nextDueOn
        ? expiryThreshold(snapshot.today, schedule.nextDueOn, MAINTENANCE_DATE)
        : null

      // La plus urgente des deux bornes : le kilométrage l'emporte s'il est franchi.
      const key = kmKey ?? dateThreshold?.key ?? null
      if (!key) continue

      const overdue =
        (schedule.nextDueKm !== null && vehicle.currentKm >= schedule.nextDueKm) ||
        (dateThreshold !== null && dateThreshold.days < 0)

      drafts.push({
        entityType: 'vehicle',
        entityId: schedule.vehicleId,
        alertType: 'maintenance.due',
        thresholdKey: key,
        // La période est l'échéance visée : le prochain entretien en ouvrira une autre.
        periodKey: schedule.nextDueOn ?? String(schedule.nextDueKm ?? schedule.id),
        severity: overdue ? 'critical' : 'high',
        ...(schedule.nextDueOn ? { dueOn: schedule.nextDueOn } : {}),
        payload: {
          vehicle: vehicle.label,
          kind: schedule.kind,
          remainingKm: schedule.nextDueKm === null ? null : schedule.nextDueKm - vehicle.currentKm,
        },
      })
    }
    return drafts
  },
}

function kilometreThreshold(nextDueKm: number | null, currentKm: number): string | null {
  if (nextDueKm === null) return null
  const remaining = nextDueKm - currentKm
  if (remaining <= 0) return 'km-0'

  const crossed = MAINTENANCE_KM_THRESHOLDS.filter((threshold) => remaining <= threshold)
  return crossed.length > 0 ? `km-${Math.min(...crossed)}` : null
}

/* --------------------------------------------------------------------- GPS */

/**
 * Sortie de zone.
 *
 * La règle ne DÉTECTE rien : le franchissement a été constaté à l'ingestion, avec la
 * trace complète sous les yeux (src/core/geofencing.ts). Un instantané ne peut pas
 * dire qu'une voiture est SORTIE — seulement où elle est. Cette règle transforme un
 * fait déjà établi en quelque chose qu'un gérant voit.
 *
 * `periodKey` est l'identifiant de l'ÉVÉNEMENT : deux sorties de la même zone le
 * même jour sont deux alertes, parce que ce sont deux faits distincts.
 */
export const gpsGeofenceExit: AlertRule = {
  type: 'gps.geofence_exit',
  severity: 'high',
  evaluate(snapshot) {
    return snapshot.geofenceExits.map((exit) => ({
      entityType: 'vehicle' as const,
      entityId: exit.vehicleId,
      alertType: 'gps.geofence_exit',
      thresholdKey: 'exit',
      periodKey: exit.id,
      severity: 'high' as const,
      dueOn: exit.onDay,
      payload: {
        vehicle: vehicleLabel(snapshot, exit.vehicleId),
        zone: exit.geofenceName,
        at: exit.occurredAt,
      },
    }))
  },
}

/**
 * Usage hors contrat.
 *
 * Une voiture qui roule alors qu'aucun contrat ne la couvre. Trois lectures
 * possibles, de la plus banale à la plus grave : un déplacement interne non saisi,
 * un contrat oublié au comptoir, ou une voiture utilisée sans qu'on le sache.
 * L'alerte ne tranche pas — elle dit ce qui a été observé et laisse le gérant lire.
 *
 * **Les véhicules en atelier sont exclus.** Un passage au garage est un déplacement
 * légitime et fréquent ; le laisser alerter produirait, chaque semaine, du bruit dont
 * on apprendrait à ne plus tenir compte — et c'est ainsi qu'on cesse de voir les vraies.
 */
export const gpsUnauthorizedUse: AlertRule = {
  type: 'gps.unauthorized_use',
  severity: 'high',
  evaluate(snapshot) {
    const drafts: AlertDraft[] = []
    const excluded = new Set(
      snapshot.vehicles
        .filter((vehicle) => vehicle.status === 'maintenance' || vehicle.status === 'sold')
        .map((vehicle) => vehicle.id),
    )

    const byVehicle = new Map<string, AlertSnapshot['gpsMovements'][number][]>()
    for (const movement of snapshot.gpsMovements) {
      if (excluded.has(movement.vehicleId)) continue
      byVehicle.set(movement.vehicleId, [...(byVehicle.get(movement.vehicleId) ?? []), movement])
    }

    for (const [vehicleId, movements] of byVehicle) {
      const windows = snapshot.contracts
        .filter((contract) => contract.vehicleId === vehicleId)
        .map((contract) => ({
          startAt: contract.startAt,
          // Retour réel si connu, sinon `null` : le contrat est encore ouvert. Prendre
          // la fin PRÉVUE ferait passer tout retard pour un usage hors contrat.
          endAt: contract.actualEndAt,
          status: contract.status,
        }))

      for (const movement of unauthorizedMovements(movements, windows)) {
        drafts.push({
          entityType: 'vehicle',
          entityId: vehicleId,
          alertType: 'gps.unauthorized_use',
          thresholdKey: 'moving',
          // Un jour civil, une alerte : le détail des relevés est dans `gps_positions`.
          periodKey: movement.onDay,
          severity: 'high',
          dueOn: movement.onDay,
          payload: {
            vehicle: vehicleLabel(snapshot, vehicleId),
            at: movement.at,
            speedKmh: Math.round(movement.speedKmh),
          },
        })
      }
    }

    return drafts
  },
}

/* ------------------------------------------------------------------ liste */

export const ALERT_RULES: ReadonlyArray<AlertRule> = [
  insuranceExpiry,
  inspectionExpiry,
  roadTaxCampaign,
  permitExpiry,
  licenceExpiry,
  contractEnding,
  contractLate,
  depositPending,
  maintenanceDue,
  gpsGeofenceExit,
  gpsUnauthorizedUse,
]
