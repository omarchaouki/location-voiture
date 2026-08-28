import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { notFound } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { addCivilMonths } from '~/core/dates'
import {
  AddInspectionInput,
  AddInsuranceInput,
  DeleteDocumentInput,
  RecordRoadTaxInput,
  SetRegistrationInput,
  UpdateInspectionInput,
  UpdateInsuranceInput,
  UpdateRegistrationInput,
  UpdateRoadTaxInput,
  type DocumentType,
} from '~/core/schemas/document'
import { getDb } from '~/db/client'
import { documentRepositories } from '~/db/repositories/documents'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { insurancePolicies, technicalInspections } from '~/db/schema/documents'
import { audit } from './audit'
import { writableTenantMiddleware } from './middleware'

/**
 * Documents administratifs.
 *
 * Chaque fonction vérifie d'abord que le VÉHICULE appartient à l'organisation :
 * sans cela, on pourrait attacher une assurance au véhicule d'un autre loueur en
 * devinant son identifiant.
 */

/**
 * Périodicité par défaut de la visite technique pour un véhicule de location : 12 mois.
 * @needs-confirmation — règle réglementaire, à confirmer auprès de la NARSA avant
 * la mise en production (docs/DECISIONS.md É4). Elle est surchargeable à la saisie.
 */
const INSPECTION_MONTHS = 12

async function assertVehicle(orgTenant: Parameters<typeof vehicleRepository>[1], vehicleId: string) {
  const vehicle = await vehicleRepository(getDb(), orgTenant).findById(vehicleId)
  if (!vehicle) throw notFound()
  return vehicle
}

export const addInsurance = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(AddInsuranceInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    await assertVehicle(tenant, data.vehicleId)

    const db = getDb()
    const documents = documentRepositories(db, tenant)

    // Une seule police courante par véhicule : les précédentes basculent en historique.
    const previous = await documents.insurance.list(
      eq(insurancePolicies.vehicleId, data.vehicleId),
    )
    for (const policy of previous) {
      if (policy.isCurrent) await documents.insurance.update(policy.id, { isCurrent: false })
    }

    const created = await documents.insurance.insert({ ...data, isCurrent: true })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'insurance.add',
      entityType: 'vehicle',
      entityId: data.vehicleId,
      after: { company: data.company, expiresOn: data.expiresOn },
      request: { ip: getRequestIP() ?? null },
    })

    return { id: (created as { id: string }).id }
  })

export const addInspection = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(AddInspectionInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    await assertVehicle(tenant, data.vehicleId)

    const db = getDb()
    const documents = documentRepositories(db, tenant)

    const previous = await documents.inspection.list(
      eq(technicalInspections.vehicleId, data.vehicleId),
    )
    for (const inspection of previous) {
      if (inspection.isCurrent) await documents.inspection.update(inspection.id, { isCurrent: false })
    }

    const expiresOn = data.expiresOn ?? addCivilMonths(data.performedOn, INSPECTION_MONTHS)
    const created = await documents.inspection.insert({ ...data, expiresOn, isCurrent: true })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'inspection.add',
      entityType: 'vehicle',
      entityId: data.vehicleId,
      after: { performedOn: data.performedOn, expiresOn },
      request: { ip: getRequestIP() ?? null },
    })

    return { id: (created as { id: string }).id, expiresOn }
  })

/**
 * Vignette : une ligne par véhicule et par ANNÉE (É3).
 * Ré-enregistrer la même année met à jour la ligne au lieu d'en créer une seconde —
 * c'est ce que fait un gérant qui paie en retard et revient corriger.
 */
export const recordRoadTax = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(RecordRoadTaxInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    await assertVehicle(tenant, data.vehicleId)

    const documents = documentRepositories(getDb(), tenant)
    const existing = await documents.roadTaxForYear(data.vehicleId, data.year)

    const row = existing
      ? await documents.roadTax.update(existing.id, data)
      : await documents.roadTax.insert(data)

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: existing ? 'roadTax.update' : 'roadTax.add',
      entityType: 'vehicle',
      entityId: data.vehicleId,
      after: { year: data.year, paidAt: data.paidAt ?? null },
      request: { ip: getRequestIP() ?? null },
    })

    return { id: (row as { id: string } | undefined)?.id ?? null }
  })

/** Carte grise : un seul enregistrement par véhicule, sans échéance (É1). */
export const setRegistration = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(SetRegistrationInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    await assertVehicle(tenant, data.vehicleId)

    const documents = documentRepositories(getDb(), tenant)
    const existing = await documents.registrationOf(data.vehicleId)

    const row = existing
      ? await documents.registration.update(existing.id, data)
      : await documents.registration.insert(data)

    return { id: (row as { id: string } | undefined)?.id ?? null }
  })


/* ================================================================== CORRIGER */

/**
 * CORRIGER ET SUPPRIMER — ce qui manquait.
 *
 * Jusqu'au 27/08/2026, une pièce saisie était définitive : quatre fonctions
 * d'ajout, aucune de correction, aucune de retrait. Une date d'expiration tapée de
 * travers restait fausse, et la seule échappatoire était d'ajouter une SECONDE
 * assurance pour faire basculer la première en historique — ce qui laisse une ligne
 * fantôme dans le carnet et fausse l'historique du véhicule.
 *
 * Deux garanties partagées par toutes les fonctions ci-dessous :
 *
 *  1. **Le repository filtre par organisation.** Une pièce d'un autre loueur ne
 *     revient pas : `update` ne trouve aucune ligne, et on rend 404 — jamais 403, qui
 *     confirmerait l'existence de l'identifiant deviné.
 *  2. **La suppression est DOUCE** (`softDelete`). Le carnet d'un véhicule est une
 *     pièce d'historique ; une assurance retirée par erreur doit pouvoir être
 *     retrouvée en base, et le journal d'audit garde qui l'a retirée.
 */

/** L'échéance recalculée quand on corrige une visite sans en donner une nouvelle. */
function inspectionExpiry(performedOn: string, given?: string): string {
  return given ?? addCivilMonths(performedOn, INSPECTION_MONTHS)
}

/** Le strict nécessaire au retrait, commun aux quatre types de pièce. */
interface DeletableDocument {
  findById: (id: string) => Promise<{ vehicleId?: string } | undefined>
  softDelete: (id: string) => Promise<boolean>
}

export const updateInsurance = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateInsuranceInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const { id, ...values } = data

    const documents = documentRepositories(getDb(), tenant)
    const before = await documents.insurance.findById(id)
    if (!before) throw notFound()

    const updated = await documents.insurance.update(id, values)
    if (!updated) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'insurance.update',
      entityType: 'vehicle',
      entityId: before.vehicleId,
      before: { company: before.company, expiresOn: before.expiresOn },
      after: { company: values.company, expiresOn: values.expiresOn },
      request: { ip: getRequestIP() ?? null },
    })

    return { id }
  })

export const updateInspection = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateInspectionInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const { id, ...values } = data

    const documents = documentRepositories(getDb(), tenant)
    const before = await documents.inspection.findById(id)
    if (!before) throw notFound()

    // Même règle qu'à la saisie : une visite sans échéance donnée vaut 12 mois (É4).
    const expiresOn = inspectionExpiry(values.performedOn, values.expiresOn)
    const updated = await documents.inspection.update(id, { ...values, expiresOn })
    if (!updated) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'inspection.update',
      entityType: 'vehicle',
      entityId: before.vehicleId,
      before: { performedOn: before.performedOn, expiresOn: before.expiresOn },
      after: { performedOn: values.performedOn, expiresOn },
      request: { ip: getRequestIP() ?? null },
    })

    return { id, expiresOn }
  })

export const updateRoadTax = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateRoadTaxInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const { id, ...values } = data

    const documents = documentRepositories(getDb(), tenant)
    const before = await documents.roadTax.findById(id)
    if (!before) throw notFound()

    const updated = await documents.roadTax.update(id, values)
    if (!updated) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'roadTax.update',
      entityType: 'vehicle',
      entityId: before.vehicleId,
      before: { year: before.year, paidAt: before.paidAt },
      after: { year: values.year, paidAt: values.paidAt ?? null },
      request: { ip: getRequestIP() ?? null },
    })

    return { id }
  })

export const updateRegistration = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateRegistrationInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const { id, ...values } = data

    const documents = documentRepositories(getDb(), tenant)
    const before = await documents.registration.findById(id)
    if (!before) throw notFound()

    const updated = await documents.registration.update(id, values)
    if (!updated) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'registration.update',
      entityType: 'vehicle',
      entityId: before.vehicleId,
      before: { registrationNumber: before.registrationNumber },
      after: { registrationNumber: values.registrationNumber ?? null },
      request: { ip: getRequestIP() ?? null },
    })

    return { id }
  })

/**
 * Retrait d'une pièce.
 *
 * Une seule fonction pour les quatre types plutôt que quatre jumelles : le type est
 * une DONNÉE validée par Zod, pas un nom de fonction. La table de correspondance
 * ci-dessous est exhaustive par construction — `Record<DocumentType, …>` fait échouer
 * la compilation le jour où un cinquième type de pièce apparaît sans son retrait.
 */
export const deleteDocument = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(DeleteDocumentInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const documents = documentRepositories(getDb(), tenant)

    /*
     * Le type structurel n'expose que les DEUX opérations dont ce retrait a besoin.
     * Les quatre repositories portent des lignes différentes ; les typer par l'un
     * d'eux ne compile pas, et les typer en `any` rendrait la table de correspondance
     * inutile. On nomme donc le contrat, pas les implémentations.
     */
    const repositories: Record<DocumentType, DeletableDocument> = {
      insurance: documents.insurance,
      inspection: documents.inspection,
      roadTax: documents.roadTax,
      registration: documents.registration,
    }

    const repository = repositories[data.type]
    const before = (await repository.findById(data.id)) as { vehicleId?: string } | undefined
    if (!before) throw notFound()

    const removed = await repository.softDelete(data.id)
    if (!removed) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: `${data.type}.delete`,
      entityType: 'vehicle',
      entityId: before.vehicleId ?? null,
      before: { id: data.id },
      request: { ip: getRequestIP() ?? null },
    })

    return { ok: true }
  })
