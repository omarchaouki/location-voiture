import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { notFound } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'

import { addCivilMonths } from '~/core/dates'
import {
  AddInspectionInput,
  AddInsuranceInput,
  RecordRoadTaxInput,
  SetRegistrationInput,
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
