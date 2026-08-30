import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { notFound } from '@tanstack/react-router'

import { addCivilDays } from '~/core/dates'
import { buildLogbook, type LogbookEntry } from '~/core/logbook'
import { formatPlate, parsePlate } from '~/core/plate'
import {
  CreateVehicleInput,
  RecordOdometerInput,
  UpdateVehicleInput,
  VehicleIdInput,
} from '~/core/schemas/vehicle'
import { getDb, type Db } from '~/db/client'
import { documentRepositories } from '~/db/repositories/documents'
import { vehicleDailyKmRepository } from '~/db/repositories/gps'
import { contractRepository } from '~/db/repositories/rental'
import { vehicleRepository, type VehicleRow } from '~/db/repositories/vehicles'
import type { TenantContext } from '~/db/tenant'
import { businessCivilDate } from '~/i18n/format'
import { audit } from './audit'
import { tenantMiddleware, writableTenantMiddleware } from './middleware'

/**
 * Véhicules — le cœur du produit.
 *
 * Chaque fonction passe par `tenantMiddleware` (lecture) ou
 * `writableTenantMiddleware` (écriture). Aucune ne reçoit d'`orgId` : il vient de la
 * session, à travers le contexte. Un véhicule d'une autre organisation est
 * introuvable, donc `notFound()` — 404, jamais 403.
 */

export interface VehicleSummary {
  id: string
  plate: string
  make: string
  model: string
  year: number | null
  status: string
  currentKm: number
  dailyCents: number | null
  /**
   * Clé de stockage de la vignette, jamais une URL — le fichier est servi par
   * `/api/fichiers/*`, qui vérifie l'organisation avant le premier octet.
   */
  photoPath: string | null
}

/** L'échéance la plus urgente d'un véhicule, telle qu'elle s'affiche en bout de ligne. */
export interface NextDeadline {
  alertType: string
  severity: string
  dueOn: string | null
}

export interface VehicleListRow extends VehicleSummary {
  nextDeadline: NextDeadline | null
}

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

export const listVehicles = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<VehicleListRow[]> => {
    const { readVehicleList } = await import('./reads/vehicles')
    return readVehicleList(getDb(), context.tenant)
  })

export interface VehicleFile {
  vehicle: VehicleSummary & {
    vin: string | null
    color: string | null
    category: string | null
    fuel: string | null
    gearbox: string | null
    seats: number | null
    currentKmAt: string | null
    depositCents: number | null
    notes: string | null
  }
  /** Date d'aujourd'hui à Casablanca, calculée au serveur (docs/DECISIONS.md É7). */
  today: string
  /**
   * Droit d'écrire, tel que le SERVEUR le voit — pas tel que l'écran le suppose.
   *
   * Il porte déjà l'abonnement gelé, l'impersonation non élevée et le rôle `viewer`
   * (`src/db/tenant.ts`). L'écran s'en sert pour ne pas proposer un bouton qui sera
   * refusé ; le refus, lui, reste porté par la server function.
   */
  canWrite: boolean
  entries: LogbookEntry[]
  /**
   * Les pièces, avec TOUT ce qui se corrige.
   *
   * La fiche n'en affichait que trois champs, parce qu'elle n'en affichait que trois.
   * Depuis que ces pièces se modifient (27/08/2026), le formulaire de correction doit
   * pouvoir se pré-remplir : un champ absent du modèle de lecture reviendrait VIDE à
   * l'écran, et serait effacé en base à la première correction d'un champ voisin.
   * C'est le défaut classique d'un formulaire d'édition alimenté par une vue partielle.
   */
  documents: {
    insurance: {
      id: string
      company: string
      policyNumber: string | null
      startsOn: string | null
      expiresOn: string
      premiumCents: number | null
      coverage: string | null
    } | null
    inspection: {
      id: string
      centerName: string | null
      certificateNumber: string | null
      performedOn: string
      expiresOn: string
      result: string
      costCents: number | null
    } | null
    roadTax: {
      id: string
      year: number
      paidAt: string | null
      amountCents: number | null
      receiptNumber: string | null
    } | null
    registration: {
      id: string
      registrationNumber: string | null
      firstRegisteredOn: string | null
      mutatedOn: string | null
      isWw: boolean
    } | null
  }
  /**
   * LES PROGRAMMES D'ENTRETIEN, vidange en tête.
   *
   * Ils étaient déjà lus par cette fonction — pour alimenter la frise — et n'étaient
   * exposés nulle part : le carnet montrait « vidange dans 500 km » sans qu'aucun
   * écran ne permette de dire tous les combien elle revient, ni d'enregistrer celle
   * qu'on vient de faire. Le programme se réglait donc uniquement par un appel d'API.
   */
  maintenance: Array<{
    id: string
    kind: string
    intervalKm: number | null
    intervalMonths: number | null
    lastDoneOn: string | null
    lastDoneKm: number | null
    nextDueOn: string | null
    nextDueKm: number | null
    isActive: boolean
  }>
}

/** Fenêtre de référence du rythme d'un véhicule. Assez longue pour lisser, assez courte pour rester actuelle. */
const RHYTHM_WINDOW_DAYS = 90

/**
 * Kilomètres par jour, sur les 90 derniers jours.
 *
 * C'est ce chiffre qui transforme « il reste 500 km avant la vidange » en « ce sera
 * vers le 12 septembre ». Sans lui, la frise n'affiche qu'un solde, et un solde ne se
 * planifie pas.
 *
 * Lu dans `vehicle_daily_km`, l'agrégat alimenté par l'ingestion GPS : au plus 90
 * lignes, contre 270 000 positions pour la même réponse. La moyenne est calculée sur
 * les jours OBSERVÉS et non sur 90 : un boîtier posé il y a deux semaines ne doit pas
 * faire croire que la voiture est à l'arrêt depuis trois mois.
 *
 * `null` quand il n'y a rien à dire — on n'invente pas un rythme.
 */
async function averageDailyKm(
  db: Db,
  ctx: TenantContext,
  vehicleId: string,
  today: string,
): Promise<number | null> {
  const rows = await vehicleDailyKmRepository(db, ctx).since(
    vehicleId,
    addCivilDays(today, -RHYTHM_WINDOW_DAYS),
  )
  if (rows.length === 0) return null

  const total = rows.reduce((sum, row) => sum + row.km, 0)
  return Math.round(total / rows.length)
}

/**
 * LA fiche véhicule — la signature du produit.
 *
 * Une seule fonction assemble tout ce que la frise affiche, pour éviter la cascade
 * de requêtes qu'un écran naïf produirait. Les documents sont lus par véhicule, pas
 * par ligne de liste : c'est une fiche, pas un tableau.
 */
export const getVehicleFile = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .validator(VehicleIdInput)
  .handler(async ({ data, context }): Promise<VehicleFile> => {
    const db = getDb()
    const tenant = context.tenant

    const vehicle = await vehicleRepository(db, tenant).findById(data.id)
    // Véhicule d'une autre organisation : introuvable. On ne révèle pas son existence.
    if (!vehicle) throw notFound()

    const documents = documentRepositories(db, tenant)
    const today = businessCivilDate(new Date())
    const year = Number(today.slice(0, 4))

    const [insurance, inspection, roadTax, registration, schedules] = await Promise.all([
      documents.currentInsurance(vehicle.id),
      documents.currentInspection(vehicle.id),
      documents.roadTaxForYear(vehicle.id, year),
      documents.registrationOf(vehicle.id),
      documents.schedulesOf(vehicle.id),
    ])

    const permitRows = await documents.permit.list()

    /*
     * Les contrats passent par le repository, pas par un `db.select()` écrit ici.
     *
     * Ce n'est pas de la coquetterie : la requête directe qui était à cette place ne
     * filtrait **ni sur `org_id` ni sur `deleted_at`**. Le véhicule ayant déjà été
     * vérifié juste au-dessus, aucune fuite n'était possible en pratique — mais c'est
     * exactement la forme qui en produit une le jour où quelqu'un la recopie ailleurs.
     * `forVehicle` applique les deux filtres, comme toutes les autres lectures.
     */
    const contractRows = (await contractRepository(db, tenant).forVehicle(vehicle.id))
      .sort((a, b) => b.plannedEndAt.localeCompare(a.plannedEndAt))
      .slice(0, 20)

    const entries = buildLogbook({
      today,
      currentKm: vehicle.currentKm,
      dailyKmAverage: await averageDailyKm(db, tenant, vehicle.id, today),
      insurance: insurance ? { id: insurance.id, expiresOn: insurance.expiresOn } : null,
      inspection: inspection ? { id: inspection.id, expiresOn: inspection.expiresOn } : null,
      roadTax: roadTax ? { id: roadTax.id, year: roadTax.year, paidAt: roadTax.paidAt } : null,
      permits: permitRows
        .filter((row) => row.isCurrent && (row.vehicleId === null || row.vehicleId === vehicle.id))
        .map((row) => ({ id: row.id, expiresOn: row.expiresOn })),
      maintenance: schedules.map((row) => ({
        id: row.id,
        kind: row.kind,
        nextDueOn: row.nextDueOn,
        nextDueKm: row.nextDueKm,
      })),
      contracts: contractRows.map((row) => ({
        id: row.id,
        reference: row.reference,
        endOn: row.plannedEndAt.slice(0, 10),
        closed: row.status === 'returned' || row.status === 'cancelled',
      })),
    })

    const parsed = parsePlate(vehicle.plate)

    return {
      vehicle: {
        ...toSummary(vehicle),
        plate: parsed ? formatPlate(parsed) : vehicle.plate,
        vin: vehicle.vin,
        color: vehicle.color,
        category: vehicle.category,
        fuel: vehicle.fuel,
        gearbox: vehicle.gearbox,
        seats: vehicle.seats,
        currentKmAt: vehicle.currentKmAt,
        depositCents: vehicle.depositCents,
        notes: vehicle.notes,
      },
      today,
      canWrite: tenant.canWrite,
      entries,
      documents: {
        insurance: insurance
          ? {
              id: insurance.id,
              company: insurance.company,
              policyNumber: insurance.policyNumber,
              startsOn: insurance.startsOn,
              expiresOn: insurance.expiresOn,
              premiumCents: insurance.premiumCents,
              coverage: insurance.coverage,
            }
          : null,
        inspection: inspection
          ? {
              id: inspection.id,
              centerName: inspection.centerName,
              certificateNumber: inspection.certificateNumber,
              performedOn: inspection.performedOn,
              expiresOn: inspection.expiresOn,
              result: inspection.result,
              costCents: inspection.costCents,
            }
          : null,
        roadTax: roadTax
          ? {
              id: roadTax.id,
              year: roadTax.year,
              paidAt: roadTax.paidAt,
              amountCents: roadTax.amountCents,
              receiptNumber: roadTax.receiptNumber,
            }
          : null,
        registration: registration
          ? {
              id: registration.id,
              registrationNumber: registration.registrationNumber,
              firstRegisteredOn: registration.firstRegisteredOn,
              mutatedOn: registration.mutatedOn,
              isWw: registration.isWw,
            }
          : null,
      },
      maintenance: schedules.map((row) => ({
        id: row.id,
        kind: row.kind,
        intervalKm: row.intervalKm,
        intervalMonths: row.intervalMonths,
        lastDoneOn: row.lastDoneOn,
        lastDoneKm: row.lastDoneKm,
        nextDueOn: row.nextDueOn,
        nextDueKm: row.nextDueKm,
        isActive: row.isActive,
      })),
    }
  })

export const createVehicle = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CreateVehicleInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const db = getDb()

    /*
     * Le quota se vérifie ICI, avant l'écriture, et côté serveur.
     *
     * C'est la première limite d'offre réellement appliquée du produit : jusqu'ici
     * `plans.max_vehicles` existait en base et n'empêchait rien. Le refus porte le
     * compte atteint et l'offre en cours, pour que l'écran propose de changer d'offre
     * plutôt que d'afficher une erreur.
     */
    const { assertQuota } = await import('./quota')
    await assertQuota(db, tenant, 'vehicles')

    const created = await vehicleRepository(db, tenant).create(data)

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'vehicle.create',
      entityType: 'vehicle',
      entityId: created.id,
      after: { plate: created.plate, make: created.make, model: created.model },
      request: { ip: getRequestIP() ?? null },
    })

    return { id: created.id }
  })

export const updateVehicle = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateVehicleInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const repository = vehicleRepository(getDb(), tenant)
    const { id, plate, ...rest } = data

    const before = await repository.findById(id)
    if (!before) throw notFound()

    if (plate !== undefined && plate !== before.plate) {
      await repository.updatePlate(id, plate)
    }
    const updated = await repository.update(id, rest)
    if (!updated) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'vehicle.update',
      entityType: 'vehicle',
      entityId: id,
      before: { plate: before.plate, status: before.status },
      after: { plate: updated.plate, status: updated.status },
      request: { ip: getRequestIP() ?? null },
    })

    return { id }
  })

/**
 * Relevé kilométrique.
 *
 * Le compteur est monotone croissant. Un relevé en recul est refusé, jamais corrigé
 * en silence : c'est lui qui pilote toutes les échéances d'entretien.
 */
export class OdometerWentBackwardsError extends Error {
  constructor(
    readonly current: number,
    readonly submitted: number,
  ) {
    super(`odometer went backwards: ${current} -> ${submitted}`)
    this.name = 'OdometerWentBackwardsError'
  }
}

export const recordOdometer = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(RecordOdometerInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const repository = vehicleRepository(getDb(), tenant)

    const vehicle = await repository.findById(data.id)
    if (!vehicle) throw notFound()
    if (data.currentKm < vehicle.currentKm) {
      throw new OdometerWentBackwardsError(vehicle.currentKm, data.currentKm)
    }

    await repository.update(data.id, {
      currentKm: data.currentKm,
      currentKmAt: new Date().toISOString(),
    })

    return { currentKm: data.currentKm }
  })

export const archiveVehicle = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(VehicleIdInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const removed = await vehicleRepository(getDb(), tenant).softDelete(data.id)
    if (!removed) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'vehicle.archive',
      entityType: 'vehicle',
      entityId: data.id,
      request: { ip: getRequestIP() ?? null },
    })

    return { ok: true }
  })
