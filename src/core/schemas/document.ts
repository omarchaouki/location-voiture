import { z } from 'zod'

/**
 * Documents administratifs du véhicule.
 *
 * Deux écarts au cahier des charges sont visibles ici, et ils sont volontaires :
 *  - la CARTE GRISE n'a pas de date d'expiration (É1) : au Maroc elle est permanente ;
 *  - la VIGNETTE est indexée sur l'ANNÉE (É3) : c'est une campagne annuelle, pas une
 *    échéance glissante.
 */

/** Date civile `YYYY-MM-DD`. Une échéance administrative n'a pas d'heure. */
const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date.invalid' })

const cents = z.int().min(0).max(1_000_000_00)
const vehicleId = z.string().min(1)

export const AddInsuranceInput = z.object({
  vehicleId,
  company: z.string().trim().min(2).max(80),
  policyNumber: z.string().trim().max(60).optional(),
  startsOn: civilDate.optional(),
  expiresOn: civilDate,
  premiumCents: cents.optional(),
  coverage: z.enum(['tous_risques', 'tiers', 'tiers_plus']).optional(),
})

export const AddInspectionInput = z.object({
  vehicleId,
  centerName: z.string().trim().max(80).optional(),
  certificateNumber: z.string().trim().max(60).optional(),
  performedOn: civilDate,
  /**
   * Échéance. Par défaut 12 mois pour un véhicule de location (É4), calculée côté
   * serveur si elle n'est pas fournie — et modifiable, parce que la règle est
   * réglementaire et reste marquée `@needs-confirmation`.
   */
  expiresOn: civilDate.optional(),
  result: z.enum(['pass', 'fail', 'pass_with_defects']).default('pass'),
  costCents: cents.optional(),
})

export const RecordRoadTaxInput = z.object({
  vehicleId,
  year: z.int().min(2000).max(2100),
  paidAt: civilDate.optional(),
  amountCents: cents.optional(),
  receiptNumber: z.string().trim().max(60).optional(),
})

export const SetRegistrationInput = z.object({
  vehicleId,
  registrationNumber: z.string().trim().max(60).optional(),
  firstRegisteredOn: civilDate.optional(),
  mutatedOn: civilDate.optional(),
  isWw: z.boolean().default(false),
  // Pas de `expiresOn` : la carte grise marocaine n'expire pas. É1.
})

export const DOCUMENT_TYPES = ['insurance', 'inspection', 'roadTax', 'registration'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]
