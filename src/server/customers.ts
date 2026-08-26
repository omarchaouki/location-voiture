import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { notFound } from '@tanstack/react-router'

import {
  BlacklistCustomerInput,
  CreateCustomerInput,
  CustomerIdInput,
  UpdateCustomerInput,
} from '~/core/schemas/rental'
import { getDb } from '~/db/client'
import { customerRepository, type CustomerRow } from '~/db/repositories/rental'
import { audit } from './audit'
import { tenantMiddleware, writableTenantMiddleware } from './middleware'

/**
 * Clients.
 *
 * Le champ qui compte vraiment est `licenceExpiresOn` : c'est lui qui bloque une
 * signature. Tout le reste est de l'identité.
 */

export interface CustomerSummary {
  id: string
  label: string
  kind: string
  phone: string | null
  city: string | null
  licenceExpiresOn: string | null
  isBlacklisted: boolean
}

function toSummary(row: CustomerRow, label: string): CustomerSummary {
  return {
    id: row.id,
    label,
    kind: row.kind,
    phone: row.phone,
    city: row.city,
    licenceExpiresOn: row.licenceExpiresOn,
    isBlacklisted: row.isBlacklisted,
  }
}

export const listCustomers = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<CustomerSummary[]> => {
    const repository = customerRepository(getDb(), context.tenant)
    const rows = await repository.list()
    return rows
      .map((row) => toSummary(row, repository.label(row)))
      .sort((a, b) => a.label.localeCompare(b.label))
  })

export interface CustomerFile extends CustomerSummary {
  firstName: string | null
  lastName: string | null
  companyName: string | null
  idType: string | null
  idNumber: string | null
  licenceNumber: string | null
  email: string | null
  address: string | null
  notes: string | null
  blacklistReason: string | null
}

export const getCustomer = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .validator(CustomerIdInput)
  .handler(async ({ data, context }): Promise<CustomerFile> => {
    const repository = customerRepository(getDb(), context.tenant)
    const row = await repository.findById(data.id)
    // Client d'une autre organisation : introuvable, jamais « interdit ».
    if (!row) throw notFound()

    return {
      ...toSummary(row, repository.label(row)),
      firstName: row.firstName,
      lastName: row.lastName,
      companyName: row.companyName,
      idType: row.idType,
      idNumber: row.idNumber,
      licenceNumber: row.licenceNumber,
      email: row.email,
      address: row.address,
      notes: row.notes,
      blacklistReason: row.blacklistReason,
    }
  })

export const createCustomer = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CreateCustomerInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const created = await customerRepository(getDb(), tenant).insert(data)

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'customer.create',
      entityType: 'customer',
      entityId: created.id,
      request: { ip: getRequestIP() ?? null },
    })

    return { id: created.id }
  })

export const updateCustomer = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateCustomerInput)
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data
    const updated = await customerRepository(getDb(), context.tenant).update(id, rest)
    if (!updated) throw notFound()
    return { id }
  })

/**
 * Liste noire.
 *
 * Mettre un client en liste noire est une décision lourde — elle lui refusera toute
 * location — donc elle exige un motif et part dans le journal d'audit.
 */
export const setBlacklist = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(BlacklistCustomerInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const updated = await customerRepository(getDb(), tenant).update(data.id, {
      isBlacklisted: data.blacklisted,
      blacklistReason: data.blacklisted ? (data.reason ?? null) : null,
      blacklistAt: data.blacklisted ? new Date().toISOString() : null,
    })
    if (!updated) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: data.blacklisted ? 'customer.blacklist' : 'customer.unblacklist',
      entityType: 'customer',
      entityId: data.id,
      after: { reason: data.reason ?? null },
      request: { ip: getRequestIP() ?? null },
    })

    return { ok: true }
  })
