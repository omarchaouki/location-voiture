import { z } from 'zod'

import { normalizePlateInput } from '~/core/plate'

/**
 * Schémas partagés client / serveur.
 *
 * Un seul schéma, importé des deux côtés : le formulaire et la server function ne
 * peuvent pas diverger. La validation qui compte est celle du SERVEUR — celle du
 * client n'est qu'un confort d'affichage.
 */

export const VEHICLE_STATUSES = [
  'available',
  'rented',
  'maintenance',
  'out_of_service',
  'sold',
] as const

export const VEHICLE_CATEGORIES = [
  'citadine',
  'compacte',
  'berline',
  'suv',
  'utilitaire',
  'premium',
] as const

export const FUELS = ['essence', 'diesel', 'hybride', 'electrique'] as const
export const GEARBOXES = ['manuelle', 'automatique'] as const

/** Plaque marocaine : la validation refuse plutôt que de deviner. Voir src/core/plate.ts. */
const plate = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .refine((value) => normalizePlateInput(value) !== null, {
    message: 'plate.invalid',
  })

/** Argent : entier en centimes. Aucun flottant ne franchit cette frontière. */
const cents = z.int().min(0).max(1_000_000_00)

export const CreateVehicleInput = z.object({
  plate,
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z.int().min(1980).max(2100).optional(),
  color: z.string().trim().max(40).optional(),
  category: z.enum(VEHICLE_CATEGORIES).optional(),
  fuel: z.enum(FUELS).optional(),
  gearbox: z.enum(GEARBOXES).optional(),
  seats: z.int().min(1).max(9).optional(),
  vin: z.string().trim().max(30).optional(),
  currentKm: z.int().min(0).max(3_000_000).default(0),
  dailyCents: cents.optional(),
  depositCents: cents.optional(),
  branchId: z.string().min(1).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export type CreateVehicleData = z.infer<typeof CreateVehicleInput>

export const UpdateVehicleInput = CreateVehicleInput.partial().extend({
  id: z.string().min(1),
  status: z.enum(VEHICLE_STATUSES).optional(),
})

export const VehicleIdInput = z.object({ id: z.string().min(1) })

/**
 * Relevé kilométrique.
 *
 * Le kilométrage est monotone croissant : un relevé en recul est une erreur de saisie
 * et se refuse. Corriger en silence, c'est fausser toutes les échéances de vidange.
 */
export const RecordOdometerInput = z.object({
  id: z.string().min(1),
  currentKm: z.int().min(0).max(3_000_000),
})
