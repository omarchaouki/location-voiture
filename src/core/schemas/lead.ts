import { z } from 'zod'

import { parseMoroccanPhone } from '~/core/phone'
import { LOCALES } from '~/i18n/locales'

/**
 * Demande de démonstration venue du site vitrine.
 *
 * Le seul formulaire du produit ouvert à un inconnu. Trois conséquences sur sa
 * conception, et aucune n'est cosmétique :
 *
 *  1. **il demande le strict minimum** — un nom et un numéro. Chaque champ
 *     obligatoire supplémentaire coûte des prospects, et un formulaire de contact
 *     n'a pas à connaître la taille de la flotte avant le premier appel ;
 *  2. **le téléphone est normalisé** (`src/core/phone.ts`), pas seulement validé :
 *     six écritures du même numéro donneraient six prospects distincts ;
 *  3. **il porte un leurre** (`website`). Un robot remplit tous les champs d'un
 *     formulaire ; un humain ne voit pas celui-ci. C'est la protection anti-robot
 *     la moins chère qui existe, et la seule qui n'impose rien à l'utilisateur —
 *     un CAPTCHA ferait fuir le gérant de 55 ans à qui ce produit s'adresse.
 */

export const FLEET_SIZES = ['1-5', '6-15', '16-40', '40+'] as const
export type FleetSize = (typeof FLEET_SIZES)[number]

export const LeadInput = z.object({
  name: z.string().trim().min(2).max(120),

  phone: z
    .string()
    .trim()
    .min(1)
    .transform((value, ctx) => {
      const parsed = parseMoroccanPhone(value)
      if (!parsed) {
        ctx.addIssue({ code: 'custom', message: 'invalid_phone' })
        return z.NEVER
      }
      return parsed
    }),

  company: z.string().trim().max(120).optional(),
  // Volontairement facultative : beaucoup de gérants n'utilisent que WhatsApp.
  email: z.email().max(180).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional(),
  fleetSize: z.enum(FLEET_SIZES).optional(),
  message: z.string().trim().max(1000).optional(),
  locale: z.enum(LOCALES),

  /** Leurre anti-robot. Rempli = requête ignorée en silence. */
  website: z.string().max(200).optional(),
})

export type LeadInputType = z.input<typeof LeadInput>
