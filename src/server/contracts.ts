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
import { settleReturn } from '~/core/settlement'
import {
  CancelContractInput,
  ContractIdInput,
  CreateContractInput,
  UpdateContractInput,
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

/**
 * CORRECTION D'UN CONTRAT — et ce que l'état autorise.
 *
 * Le manque était réel : un tarif négocié après coup, une remise oubliée, un retour
 * repoussé de deux jours n'avaient aucun chemin. La seule issue était d'annuler et de
 * ressaisir, ce qui casse la numérotation continue et perd les paiements déjà reçus.
 *
 * TROIS RÈGLES, et elles viennent du métier, pas du modèle :
 *
 *  1. **Un contrat CLOS ou ANNULÉ ne se corrige plus.** Il a produit une facture et
 *     des écritures ; le rouvrir en douce désaccorderait la comptabilité de la réalité.
 *  2. **Une fois le véhicule PARTI, la date de début ne bouge plus.** Elle est un
 *     fait constaté au comptoir, pas une intention. Ce qui reste modifiable, c'est la
 *     date de FIN — prolonger une location est le cas courant, et c'est même la
 *     première raison d'ouvrir cet écran.
 *  3. **Les montants sont RECALCULÉS**, jamais reçus du navigateur. `priceRental` est
 *     la seule autorité sur le nombre de jours facturés, la TVA et le total : accepter
 *     un total envoyé par le client, c'est accepter n'importe quel total.
 */
export class ContractNotEditableError extends Error {
  constructor(readonly status: string) {
    super(`contract not editable in status ${status}`)
    this.name = 'ContractNotEditableError'
  }
}

export const updateContract = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(UpdateContractInput)
  .handler(async ({ data, context }) => {
    const db = getDb()
    const tenant = context.tenant
    const repository = contractRepository(db, tenant)

    const before = await repository.findById(data.id)
    // Contrat d'une autre organisation : introuvable, jamais « interdit ».
    if (!before) throw notFound()
    /*
     * `returned`, et non `closed` — qui n'a JAMAIS été un statut de contrat.
     *
     * Les statuts sont `reservation | active | returned | late | cancelled`
     * (`ContractStatus`). La comparaison à `'closed'` n'a donc jamais été vraie, et un
     * contrat RENDU restait modifiable : rouvrir l'écran de correction sur une
     * location soldée recalculait les jours et le total sur les dates PRÉVUES,
     * effaçant le décompte de retour — jours de retard, carburant, dommages — tout en
     * laissant la retenue sur caution et sa ligne d'encaissement derrière. Le contrat
     * se contredisait alors lui-même, et personne n'avait de raison de rouvrir la
     * fiche pour s'en apercevoir.
     *
     * Le même test existait à l'identique dans la fiche contrat, avec la même faute.
     */
    if (before.status === 'returned' || before.status === 'cancelled') {
      throw new ContractNotEditableError(before.status)
    }

    const started = before.actualStartAt !== null
    const plannedStartAt = started
      ? before.plannedStartAt
      : (data.plannedStartAt ?? before.plannedStartAt)
    const plannedEndAt = data.plannedEndAt ?? before.plannedEndAt

    if (plannedEndAt <= plannedStartAt) throw new Error('contract.endBeforeStart')

    const dailyCents = data.dailyCents ?? before.dailyCents
    const discountCents = data.discountCents ?? before.discountCents
    const extrasCents = data.extrasCents ?? before.extrasCents

    const pricing = priceRental({
      startAt: plannedStartAt,
      endAt: plannedEndAt,
      dailyCents,
      discountCents,
      extrasCents,
    })

    const updated = await repository.update(data.id, {
      plannedStartAt,
      plannedEndAt,
      dailyCents,
      discountCents,
      extrasCents,
      daysBilled: pricing.daysBilled,
      subtotalCents: pricing.subtotalCents,
      vatCents: pricing.vatCents,
      totalCents: pricing.totalCents,
      depositCents: data.depositCents ?? before.depositCents,
    })
    if (!updated) throw notFound()

    await audit({
      orgId: tenant.orgId,
      actorUserId: tenant.userId,
      impersonated: tenant.impersonated,
      action: 'contract.update',
      entityType: 'contract',
      entityId: data.id,
      before: {
        plannedEndAt: before.plannedEndAt,
        dailyCents: before.dailyCents,
        totalCents: before.totalCents,
      },
      after: {
        plannedEndAt,
        dailyCents,
        totalCents: pricing.totalCents,
      },
      request: { ip: getRequestIP() ?? null },
    })

    return { id: data.id, totalCents: pricing.totalCents }
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

/**
 * LE RETOUR — et le DÉCOMPTE qui va avec.
 *
 * Le geste écrit six choses d'un coup, et c'est volontaire : elles ne peuvent pas être
 * vraies séparément. Une voiture rendue sans que les jours de retard soient facturés,
 * ou une caution retenue sans que le solde bouge, laisse un contrat qui se contredit
 * lui-même — et personne ne va rouvrir la fiche pour réconcilier à la main.
 *
 *  1. le contrat passe à `returned`, le compteur et la jauge sont constatés ;
 *  2. les JOURS sont recalculés sur le retour réel (`settleReturn`) ;
 *  3. carburant et dommages entrent dans les extras, TVA recalculée avec ;
 *  4. la caution est imputée sur ce qui reste dû, et pas au-delà ;
 *  5. la part retenue devient une LIGNE D'ENCAISSEMENT — voir plus bas, c'est la
 *     partie qui manquait le plus ;
 *  6. la voiture redevient disponible avec son kilométrage à jour.
 *
 * **Le décompte est calculé ICI, jamais reçu.** L'écran envoie des constats de
 * comptoir — un compteur, une jauge, des frais — et le serveur en tire les totaux. Un
 * client de l'API qui pourrait poster un `totalCents` choisirait le prix de sa
 * location.
 */
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

    /*
     * Ce qui a DÉJÀ été versé. C'est toute la différence entre « le client doit
     * 2 400 » et « le client a déjà versé 2 000 » — donc entre retenir la caution
     * entière et n'en retenir presque rien.
     */
    const previousPayments = (await repository.payments.list()).filter(
      (payment) => payment.contractId === contract.id,
    )
    const paidCents = previousPayments.reduce((total, payment) => total + payment.amountCents, 0)

    const settlement = settleReturn(
      {
        // Départ RÉEL si connu : on ne facture pas au client les heures pendant
        // lesquelles la voiture l'attendait au comptoir.
        startAt: contract.actualStartAt ?? contract.plannedStartAt,
        plannedEndAt: contract.plannedEndAt,
        actualEndAt: now,
        dailyCents: contract.dailyCents,
        daysAlreadyBilled: contract.daysBilled,
        discountCents: contract.discountCents,
        baseExtrasCents: contract.extrasCents,
        fuelChargeCents: data.fuelChargeCents ?? 0,
        damageChargeCents: data.damageChargeCents ?? 0,
        depositCents: contract.depositCents,
        paidCents,
        startFuelEighths: contract.startFuelEighths,
        endFuelEighths: data.endFuelEighths,
        startKm: contract.startKm,
        endKm: data.endKm,
      },
      data.depositWithheldCents,
    )

    /*
     * LA CAUTION RETENUE EST UN ENCAISSEMENT, et doit apparaître comme tel.
     *
     * Sans cette ligne, le contrat restait « il reste 500 à payer » alors que les 500
     * avaient été pris sur la caution : le solde de la fiche mentait, la facture
     * derrière aussi, et le gérant relançait un client qui ne devait plus rien.
     *
     * `method: 'deposit'` n'est PAS dans `PAYMENT_METHODS` — et c'est délibéré. Cette
     * liste est celle du menu « encaisser » : on ne paie pas *avec* une caution au
     * comptoir, c'est le retour qui l'impute. La colonne est du texte libre, la valeur
     * est donc écrite ici sans toucher au menu.
     */
    if (settlement.depositWithheldCents > 0) {
      await repository.payments.insert({
        contractId: contract.id,
        amountCents: settlement.depositWithheldCents,
        currency: contract.currency,
        method: 'deposit',
        receivedAt: now,
        note: null,
      })
    }

    const collectedCents = paidCents + settlement.depositWithheldCents

    /*
     * La caution est-elle SOLDÉE ?
     *
     * Deux questions distinctes, et les confondre était le défaut de la version
     * précédente — on pouvait cocher « caution rendue » en retenant 500 dirhams.
     *
     *  - s'il ne reste RIEN à rendre, l'affaire est close d'office ;
     *  - s'il reste quelque chose, seul l'agent sait si l'argent est effectivement
     *    reparti. Un chèque se déchire au comptoir, une empreinte de carte se libère
     *    parfois le lendemain.
     *
     * Tant que la date reste vide, la règle `deposit.pending` réveille l'agence 48 h
     * après le retour. C'est exactement ce qu'on veut : une caution oubliée dans un
     * tiroir est un litige qui arrive.
     */
    const depositSettled = settlement.depositDueBackCents === 0 || data.returnDeposit

    await repository.update(data.id, {
      status: 'returned',
      actualEndAt: now,
      endKm: data.endKm,
      endFuelEighths: data.endFuelEighths,

      // Le décompte devient le contrat : jours, extras et TVA recalculés.
      daysBilled: settlement.daysBilled,
      extrasCents: settlement.extrasCents,
      subtotalCents: settlement.subtotalCents,
      vatCents: settlement.vatCents,
      totalCents: settlement.totalCents,

      depositWithheldCents: settlement.depositWithheldCents,
      // Invariant 6 : la restitution ne peut pas précéder le retour.
      depositReturnedAt: depositSettled ? now : null,

      paymentStatus:
        collectedCents >= settlement.totalCents ? 'paid' : collectedCents > 0 ? 'partial' : 'unpaid',
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
      /*
       * Le décompte ENTIER part au journal, pas seulement le montant retenu.
       *
       * C'est la pièce qu'on ressortira le jour où un client conteste une retenue six
       * mois plus tard : combien de jours de retard, quel carburant manquait, ce qui
       * avait déjà été payé. Le montant seul ne se défend pas.
       */
      after: {
        endKm: data.endKm,
        endFuelEighths: data.endFuelEighths,
        lateDays: settlement.lateDays,
        fuelShortfallEighths: settlement.fuelShortfallEighths,
        fuelChargeCents: settlement.fuelChargeCents,
        damageChargeCents: settlement.damageChargeCents,
        totalCents: settlement.totalCents,
        paidBeforeCents: paidCents,
        depositCents: settlement.depositCents,
        depositWithheldCents: settlement.depositWithheldCents,
        depositReturned: depositSettled,
        remainingToCollectCents: settlement.remainingToCollectCents,
      },
      request: { ip: getRequestIP() ?? null },
    })

    // Le décompte remonte à l'écran : c'est lui qu'on tourne vers le client.
    return { ok: true, settlement }
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
