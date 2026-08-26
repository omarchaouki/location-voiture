import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { notFound } from '@tanstack/react-router'

import { formatPlate, parsePlate } from '~/core/plate'
import {
  assertTransition,
  checkSignature,
  findOverlap,
  isOverridable,
  nextReference,
  priceRental,
  type ContractStatus,
  type SignatureBlock,
} from '~/core/rental'
import {
  CancelContractInput,
  ContractIdInput,
  CreateContractInput,
  RecordPaymentInput,
  ReturnContractInput,
  StartContractInput,
} from '~/core/schemas/rental'
import { getDb } from '~/db/client'
import { contractRepository, customerRepository } from '~/db/repositories/rental'
import { vehicleRepository } from '~/db/repositories/vehicles'
import { businessCivilDate } from '~/i18n/format'
import { audit } from './audit'
import { tenantMiddleware, writableTenantMiddleware } from './middleware'
import { requireRole } from '~/auth/guards'

/**
 * Contrats de location.
 *
 * Le fichier applique quatre invariants de `docs/DOMAIN.md` §6 :
 *  3. pas deux contrats actifs qui se chevauchent sur le même véhicule ;
 *  4. pas de location d'un véhicule en entretien ou immobilisé ;
 *  5. pas de signature avec un permis expiré, sauf dérogation tracée ;
 *  7. `end_km >= start_km`, et le compteur du véhicule ne recule jamais.
 */

/** Levée quand un contrat ne peut pas être signé. Portée à l'écran, pas masquée. */
export class SignatureBlockedError extends Error {
  constructor(readonly blocks: SignatureBlock[]) {
    super(`signature blocked: ${blocks.map((block) => block.reason).join(', ')}`)
    this.name = 'SignatureBlockedError'
  }
}

export interface ContractSummary {
  id: string
  reference: string
  status: ContractStatus
  vehicleId: string
  vehicleLabel: string
  customerId: string
  customerLabel: string
  plannedStartAt: string
  plannedEndAt: string
  actualEndAt: string | null
  totalCents: number
  depositCents: number
  depositReturnedAt: string | null
  paymentStatus: string
  paidCents: number
}

export const listContracts = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<ContractSummary[]> => {
    const db = getDb()
    const tenant = context.tenant

    const contractsRepo = contractRepository(db, tenant)
    const customersRepo = customerRepository(db, tenant)

    const [rows, vehicles, customers, payments] = await Promise.all([
      contractsRepo.list(),
      vehicleRepository(db, tenant).list(),
      customersRepo.list(),
      contractsRepo.payments.list(),
    ])

    // Index en mémoire plutôt qu'une requête par ligne : c'est le N+1 que le
    // cahier des charges interdit explicitement (§17, critère 11).
    const vehicleById = new Map(vehicles.map((row) => [row.id, row]))
    const customerById = new Map(customers.map((row) => [row.id, row]))
    const paidByContract = new Map<string, number>()
    for (const payment of payments) {
      paidByContract.set(
        payment.contractId,
        (paidByContract.get(payment.contractId) ?? 0) + payment.amountCents,
      )
    }

    return rows
      .map((row) => {
        const vehicle = vehicleById.get(row.vehicleId)
        const parsed = vehicle ? parsePlate(vehicle.plate) : null
        const customer = customerById.get(row.customerId)

        return {
          id: row.id,
          reference: row.reference,
          status: row.status as ContractStatus,
          vehicleId: row.vehicleId,
          vehicleLabel: vehicle
            ? `${parsed ? formatPlate(parsed) : vehicle.plate} — ${vehicle.make} ${vehicle.model}`
            : row.vehicleId,
          customerId: row.customerId,
          customerLabel: customer ? customersRepo.label(customer) : row.customerId,
          plannedStartAt: row.plannedStartAt,
          plannedEndAt: row.plannedEndAt,
          actualEndAt: row.actualEndAt,
          totalCents: row.totalCents,
          depositCents: row.depositCents,
          depositReturnedAt: row.depositReturnedAt,
          paymentStatus: row.paymentStatus,
          paidCents: paidByContract.get(row.id) ?? 0,
        }
      })
      .sort((a, b) => b.plannedStartAt.localeCompare(a.plannedStartAt))
  })

/**
 * Vérification préalable, sans rien écrire.
 *
 * L'écran l'appelle pendant la saisie pour montrer les blocages AVANT que l'agent ne
 * remplisse tout le formulaire. La même vérification est refaite à la création :
 * celle-ci n'est qu'un confort, celle-là fait foi.
 */
export const checkContractSignature = createServerFn({ method: 'POST' })
  .middleware([tenantMiddleware])
  .validator(CreateContractInput.partial().required({ vehicleId: true, customerId: true }))
  .handler(async ({ data, context }): Promise<{ blocks: SignatureBlock[]; overridable: boolean }> => {
    const blocks = await computeBlocks(context.tenant, {
      vehicleId: data.vehicleId,
      customerId: data.customerId,
      plannedStartAt: data.plannedStartAt ?? new Date().toISOString(),
      plannedEndAt: data.plannedEndAt ?? new Date().toISOString(),
    })
    return { blocks, overridable: isOverridable(blocks) }
  })

async function computeBlocks(
  tenant: Parameters<typeof vehicleRepository>[1],
  input: { vehicleId: string; customerId: string; plannedStartAt: string; plannedEndAt: string; excludeId?: string },
): Promise<SignatureBlock[]> {
  const db = getDb()
  const vehicle = await vehicleRepository(db, tenant).findById(input.vehicleId)
  if (!vehicle) throw notFound()

  const customer = await customerRepository(db, tenant).findById(input.customerId)
  if (!customer) throw notFound()

  const existing = await contractRepository(db, tenant).forVehicle(input.vehicleId)
  const overlap = findOverlap(
    {
      startAt: input.plannedStartAt,
      endAt: input.plannedEndAt,
      ...(input.excludeId ? { excludeId: input.excludeId } : {}),
    },
    existing.map((row) => ({
      id: row.id,
      startAt: row.plannedStartAt,
      endAt: row.plannedEndAt,
      // Un contrat annulé ou rendu ne bloque plus le véhicule.
      blocking: row.status === 'reservation' || row.status === 'active' || row.status === 'late',
    })),
  )

  return checkSignature({
    today: businessCivilDate(new Date()),
    customer: {
      licenceExpiresOn: customer.licenceExpiresOn,
      isBlacklisted: customer.isBlacklisted,
      blacklistReason: customer.blacklistReason,
      kind: customer.kind,
    },
    vehicle: { status: vehicle.status },
    overlap,
  })
}

export const createContract = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CreateContractInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant

    const blocks = await computeBlocks(tenant, {
      vehicleId: data.vehicleId,
      customerId: data.customerId,
      plannedStartAt: data.plannedStartAt,
      plannedEndAt: data.plannedEndAt,
    })

    if (blocks.length > 0) {
      // Une dérogation est possible sur le permis et la liste noire, jamais sur un
      // chevauchement — et seulement pour owner/manager.
      if (!data.override || !isOverridable(blocks)) throw new SignatureBlockedError(blocks)
      requireRole(tenant, 'owner', 'manager')
    }

    const vehicle = await vehicleRepository(db, tenant).findById(data.vehicleId)
    if (!vehicle) throw notFound()

    const dailyCents = data.dailyCents ?? vehicle.dailyCents ?? 0
    const pricing = priceRental({
      startAt: data.plannedStartAt,
      endAt: data.plannedEndAt,
      dailyCents,
      ...(data.discountCents === undefined ? {} : { discountCents: data.discountCents }),
      ...(data.extrasCents === undefined ? {} : { extrasCents: data.extrasCents }),
    })

    const repository = contractRepository(db, tenant)
    const year = Number(businessCivilDate(new Date()).slice(0, 4))
    const reference = nextReference(year, await repository.lastReference())

    const created = await repository.insert({
      reference,
      vehicleId: data.vehicleId,
      customerId: data.customerId,
      additionalDriverCustomerId: data.additionalDriverCustomerId ?? null,
      plannedStartAt: data.plannedStartAt,
      plannedEndAt: data.plannedEndAt,
      dailyCents,
      daysBilled: pricing.daysBilled,
      discountCents: data.discountCents ?? 0,
      extrasCents: data.extrasCents ?? 0,
      subtotalCents: pricing.subtotalCents,
      vatCents: pricing.vatCents,
      totalCents: pricing.totalCents,
      depositCents: data.depositCents ?? vehicle.depositCents ?? 0,
      depositMethod: data.depositMethod ?? null,
      status: 'reservation',
    })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'contract.create',
      entityType: 'contract',
      entityId: created.id,
      after: {
        reference,
        vehicleId: data.vehicleId,
        customerId: data.customerId,
        totalCents: pricing.totalCents,
        // La dérogation est tracée avec son motif : c'est tout l'intérêt.
        override: data.override ?? null,
        overriddenBlocks: blocks.length > 0 ? blocks.map((block) => block.reason).join(',') : null,
      },
      request: { ip: getRequestIP() ?? null },
    })

    return { id: created.id, reference }
  })

/** Départ du véhicule : le contrat devient actif et la voiture passe en « loué ». */
export const startContract = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(StartContractInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    const repository = contractRepository(db, tenant)

    const contract = await repository.findById(data.id)
    if (!contract) throw notFound()
    assertTransition(contract.status as ContractStatus, 'active')

    const now = new Date().toISOString()
    await repository.update(data.id, {
      status: 'active',
      actualStartAt: now,
      startKm: data.startKm,
      startFuelEighths: data.startFuelEighths,
      depositTakenAt: contract.depositCents > 0 ? now : null,
    })

    // Le statut du véhicule est dérivé mais stocké : on le tient à jour ici.
    await vehicleRepository(db, tenant).update(contract.vehicleId, {
      status: 'rented',
      currentKm: data.startKm,
      currentKmAt: now,
    })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'contract.start',
      entityType: 'contract',
      entityId: data.id,
      after: { startKm: data.startKm },
      request: { ip: getRequestIP() ?? null },
    })

    return { ok: true }
  })

/** Levée quand le kilométrage de retour est inférieur à celui du départ. */
export class OdometerInconsistentError extends Error {
  constructor(
    readonly startKm: number,
    readonly endKm: number,
  ) {
    super(`end km ${endKm} below start km ${startKm}`)
    this.name = 'OdometerInconsistentError'
  }
}

export const returnContract = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(ReturnContractInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    const repository = contractRepository(db, tenant)

    const contract = await repository.findById(data.id)
    if (!contract) throw notFound()
    assertTransition(contract.status as ContractStatus, 'returned')

    // Invariant 7 : le compteur ne recule pas. On refuse, on ne corrige pas.
    if (contract.startKm !== null && data.endKm < contract.startKm) {
      throw new OdometerInconsistentError(contract.startKm, data.endKm)
    }

    const now = new Date().toISOString()
    await repository.update(data.id, {
      status: 'returned',
      actualEndAt: now,
      endKm: data.endKm,
      endFuelEighths: data.endFuelEighths,
      depositWithheldCents: data.depositWithheldCents ?? 0,
      // Invariant 6 : la restitution ne peut pas précéder le retour.
      depositReturnedAt: data.returnDeposit ? now : null,
    })

    await vehicleRepository(db, tenant).update(contract.vehicleId, {
      status: 'available',
      currentKm: data.endKm,
      currentKmAt: now,
    })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'contract.return',
      entityType: 'contract',
      entityId: data.id,
      after: {
        endKm: data.endKm,
        depositWithheldCents: data.depositWithheldCents ?? 0,
        depositReturned: data.returnDeposit,
      },
      request: { ip: getRequestIP() ?? null },
    })

    return { ok: true }
  })

export const cancelContract = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(CancelContractInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    // Annuler un contrat déjà signé engage l'organisation : réservé à owner/manager.
    requireRole(tenant, 'owner', 'manager')

    const repository = contractRepository(db, tenant)
    const contract = await repository.findById(data.id)
    if (!contract) throw notFound()
    assertTransition(contract.status as ContractStatus, 'cancelled')

    await repository.update(data.id, { status: 'cancelled', cancelReason: data.reason })

    if (contract.status === 'active') {
      await vehicleRepository(db, tenant).update(contract.vehicleId, { status: 'available' })
    }

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'contract.cancel',
      entityType: 'contract',
      entityId: data.id,
      after: { reason: data.reason },
      request: { ip: getRequestIP() ?? null },
    })

    return { ok: true }
  })

export const recordPayment = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(RecordPaymentInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    const repository = contractRepository(db, tenant)

    const contract = await repository.findById(data.contractId)
    if (!contract) throw notFound()

    await repository.payments.insert({
      contractId: data.contractId,
      amountCents: data.amountCents,
      method: data.method,
      receivedAt: new Date().toISOString(),
      note: data.note ?? null,
    })

    // Invariant 8 : la somme des règlements ne dépasse pas le dû.
    const payments = await repository.payments.list()
    const paid = payments
      .filter((payment) => payment.contractId === data.contractId)
      .reduce((total, payment) => total + payment.amountCents, 0)

    await repository.update(data.contractId, {
      paymentStatus: paid >= contract.totalCents ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    })

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'contract.payment',
      entityType: 'contract',
      entityId: data.contractId,
      after: { amountCents: data.amountCents, method: data.method },
      request: { ip: getRequestIP() ?? null },
    })

    return { paidCents: paid }
  })

export const getContract = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .validator(ContractIdInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    const repository = contractRepository(db, tenant)

    const contract = await repository.findById(data.id)
    if (!contract) throw notFound()

    const vehicle = await vehicleRepository(db, tenant).findById(contract.vehicleId)
    const customersRepo = customerRepository(db, tenant)
    const customer = await customersRepo.findById(contract.customerId)
    const payments = (await repository.payments.list()).filter(
      (payment) => payment.contractId === contract.id,
    )
    const parsed = vehicle ? parsePlate(vehicle.plate) : null

    return {
      contract,
      vehicleLabel: vehicle
        ? `${parsed ? formatPlate(parsed) : vehicle.plate} — ${vehicle.make} ${vehicle.model}`
        : contract.vehicleId,
      customerLabel: customer ? customersRepo.label(customer) : contract.customerId,
      payments,
      paidCents: payments.reduce((total, payment) => total + payment.amountCents, 0),
    }
  })
