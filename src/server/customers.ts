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

/**
 * LE COMPTE D'UN CLIENT — facturé, encaissé, reste dû.
 *
 * Trois nombres en centimes ENTIERS, jamais un flottant, et jamais un pourcentage
 * calculé au serveur : l'écran présentera ce qu'il veut, mais l'argent qui traverse
 * la frontière reste de l'argent exact.
 */
export interface CustomerLedger {
  id: string
  label: string
  phone: string | null
  email: string | null
  /** Nombre de locations facturables — annulations exclues. */
  contracts: number
  billedCents: number
  paidCents: number
  /** Ce qui reste dû. Jamais négatif : un trop-perçu n'efface pas la dette d'un autre. */
  balanceCents: number
  /** Fin de la location la plus récente. C'est ce qu'on cite au téléphone. */
  lastRentalOn: string | null
}

export interface CustomersLedger {
  rows: CustomerLedger[]
  billedCents: number
  paidCents: number
  outstandingCents: number
  outstandingCustomers: number
  payingCustomers: number
}

/**
 * L'état des encaissements, client par client.
 *
 * Séparée de `listCustomers` et non fondue dedans : la liste des clients sert au
 * COMPTOIR — on y cherche un nom et une date de permis, et elle doit rester rapide —
 * tandis que ceci lit tous les contrats et tous les encaissements de l'agence. Les
 * mélanger ferait payer à chaque ouverture de la liste le prix d'un tableau qu'on ne
 * consulte qu'au bureau.
 */
export const loadCustomersLedger = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<CustomersLedger> => {
    const { readCustomersLedger } = await import('./reads/customers')
    return readCustomersLedger(getDb(), context.tenant)
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

/** Levée quand une correction viderait l'identité affichable du client. */
export class CustomerNameRequiredError extends Error {
  constructor() {
    super('customer.nameRequired')
    this.name = 'CustomerNameRequiredError'
  }
}

export const updateCustomer = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateCustomerInput)
  .handler(async ({ data, context }) => {
    const tenant = context.tenant
    const { id, ...rest } = data
    const repository = customerRepository(getDb(), tenant)

    const before = await repository.findById(id)
    // Client d'une autre organisation : introuvable, jamais « interdit ».
    if (!before) throw notFound()

    /*
     * L'INVARIANT D'IDENTITÉ, vérifié sur l'état FUSIONNÉ.
     *
     * `CreateCustomerInput` le porte par un `refine` ; la correction ne peut pas, parce
     * que chaque champ y est facultatif et qu'un champ absent veut dire « inchangé ».
     * On reconstitue donc la ligne telle qu'elle sera, et on refuse si elle n'a plus de
     * nom — un client sans identité affichable apparaît en blanc dans toutes les listes
     * et dans tous les contrats déjà signés.
     */
    const merged: CustomerRow = {
      ...before,
      // Un champ ABSENT de la correction veut dire « inchangé », jamais « vidé ».
      // `?? before` est donc la fusion correcte, et `{ ...before, ...rest }` ne l'est
      // pas : il écraserait avec `undefined` les champs que le formulaire n'envoie pas.
      kind: rest.kind ?? before.kind,
      firstName: rest.firstName ?? before.firstName,
      lastName: rest.lastName ?? before.lastName,
      companyName: rest.companyName ?? before.companyName,
    }

    const hasIdentity =
      merged.kind === 'company'
        ? Boolean(merged.companyName)
        : Boolean(merged.firstName ?? merged.lastName)
    if (!hasIdentity) throw new CustomerNameRequiredError()

    const updated = await repository.update(id, rest)
    if (!updated) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'customer.update',
      entityType: 'customer',
      entityId: id,
      before: { label: repository.label(before), phone: before.phone },
      after: { label: repository.label(merged), phone: rest.phone ?? before.phone },
      request: { ip: getRequestIP() ?? null },
    })

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
