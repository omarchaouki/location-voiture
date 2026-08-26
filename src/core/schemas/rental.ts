import { z } from 'zod'

/**
 * Schémas partagés client / serveur pour les clients et les contrats.
 * La validation qui compte est celle du serveur.
 */

const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date.invalid' })
const instant = z.string().min(10)
const cents = z.int().min(0).max(1_000_000_00)

export const CUSTOMER_KINDS = ['individual', 'company'] as const
export const ID_TYPES = ['cin', 'passport', 'carte_sejour'] as const
export const DEPOSIT_METHODS = ['cash', 'cheque', 'card_imprint', 'transfer'] as const
export const PAYMENT_METHODS = ['cash', 'cheque', 'card', 'transfer'] as const

/* ------------------------------------------------------------------- clients */

export const CreateCustomerInput = z
  .object({
    kind: z.enum(CUSTOMER_KINDS).default('individual'),
    firstName: z.string().trim().max(60).optional(),
    lastName: z.string().trim().max(60).optional(),
    companyName: z.string().trim().max(120).optional(),

    idType: z.enum(ID_TYPES).optional(),
    idNumber: z.string().trim().max(40).optional(),

    licenceNumber: z.string().trim().max(40).optional(),
    licenceIssuedOn: civilDate.optional(),
    /** Bloquant à la signature une fois dépassée (docs/DOMAIN.md invariant 5). */
    licenceExpiresOn: civilDate.optional(),
    licenceCountry: z.string().trim().length(2).default('MA'),

    nationality: z.string().trim().max(40).optional(),
    birthOn: civilDate.optional(),
    phone: z.string().trim().max(30).optional(),
    email: z.email().optional(),
    address: z.string().trim().max(200).optional(),
    city: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  // Un particulier a un nom, une société a une raison sociale. Sans cela, on
  // enregistrerait des clients sans identité affichable.
  .refine(
    (value) =>
      value.kind === 'company'
        ? Boolean(value.companyName)
        : Boolean(value.firstName ?? value.lastName),
    { message: 'customer.nameRequired', path: ['lastName'] },
  )

export const UpdateCustomerInput = z.object({
  id: z.string().min(1),
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  companyName: z.string().trim().max(120).optional(),
  idNumber: z.string().trim().max(40).optional(),
  licenceNumber: z.string().trim().max(40).optional(),
  licenceExpiresOn: civilDate.optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.email().optional(),
  city: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export const BlacklistCustomerInput = z.object({
  id: z.string().min(1),
  blacklisted: z.boolean(),
  reason: z.string().trim().max(200).optional(),
})

export const CustomerIdInput = z.object({ id: z.string().min(1) })

/* ------------------------------------------------------------------ contrats */

export const CreateContractInput = z.object({
  vehicleId: z.string().min(1),
  customerId: z.string().min(1),
  additionalDriverCustomerId: z.string().min(1).optional(),
  plannedStartAt: instant,
  plannedEndAt: instant,
  /** Laissé vide, le tarif du véhicule s'applique. */
  dailyCents: cents.optional(),
  discountCents: cents.optional(),
  extrasCents: cents.optional(),
  depositCents: cents.optional(),
  depositMethod: z.enum(DEPOSIT_METHODS).optional(),
  /**
   * Dérogation à un blocage (permis expiré, liste noire). Réservée à owner/manager,
   * exige un motif, et part dans `audit_log`.
   */
  override: z.string().trim().min(5).max(200).optional(),
})

export const ContractIdInput = z.object({ id: z.string().min(1) })

/** Départ : on relève le compteur et la jauge, c'est ce que fait un agent. */
export const StartContractInput = z.object({
  id: z.string().min(1),
  startKm: z.int().min(0).max(3_000_000),
  /** Carburant en HUITIÈMES : c'est ce que lit une jauge. */
  startFuelEighths: z.int().min(0).max(8),
})

export const ReturnContractInput = z.object({
  id: z.string().min(1),
  endKm: z.int().min(0).max(3_000_000),
  endFuelEighths: z.int().min(0).max(8),
  /** Montant retenu sur la caution, le cas échéant. */
  depositWithheldCents: cents.optional(),
  returnDeposit: z.boolean().default(true),
})

export const CancelContractInput = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3).max(200),
})

export const RecordPaymentInput = z.object({
  contractId: z.string().min(1),
  amountCents: cents.min(1),
  method: z.enum(PAYMENT_METHODS).default('cash'),
  note: z.string().trim().max(200).optional(),
})
