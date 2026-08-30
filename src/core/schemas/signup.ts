import { z } from 'zod'

import { parseMoroccanPhone } from '~/core/phone'
import { LOCALES } from '~/i18n/locales'

/**
 * INSCRIPTION D'UNE AGENCE — le second formulaire ouvert à un inconnu, et le seul
 * qui crée quelque chose de durable.
 *
 * Jusqu'ici le site ne savait que prendre une DEMANDE : le visiteur laissait son
 * numéro, quelqu'un rappelait, une organisation était montée à la main depuis
 * `/admin`, une invitation partait. Entre le clic et le premier écran du produit, il
 * pouvait s'écouler deux jours — et deux jours après avoir comparé trois logiciels,
 * personne ne se souvient duquel il attend l'appel.
 *
 * Ce schéma décrit donc une inscription qui aboutit à un accès, tout de suite. Ce qui
 * change quatre choses par rapport au formulaire de prospect :
 *
 *  1. **rien n'est facultatif ici**, ou presque. Un prospect se rappelle avec un nom
 *     et un numéro ; une agence qui ouvre son espace a besoin d'une raison sociale,
 *     d'une adresse de connexion et d'un mot de passe — ce sont des données de compte,
 *     pas des données de contact ;
 *  2. **le mot de passe est saisi deux fois.** Une faute de frappe sur le seul chemin
 *     d'entrée du produit, et le nouvel inscrit est dehors avant d'être entré ;
 *  3. **l'offre est choisie ici**, et elle est vérifiée en base côté serveur. Le code
 *     d'offre voyage donc en clair depuis le navigateur, ce qui est sans risque tant
 *     que le serveur refuse tout ce qui n'est pas une offre publique — il le fait ;
 *  4. **le leurre reste** (`website`), pour la même raison que sur le formulaire de
 *     prospect : c'est la protection anti-robot la moins chère, et la seule qui
 *     n'impose rien à un gérant de 55 ans.
 *
 * La longueur minimale du mot de passe est celle de Better Auth (`minPasswordLength: 10`).
 * Elle est répétée ici pour que le refus arrive AVANT la création du compte, avec un
 * message dans la langue du visiteur, plutôt qu'en erreur brute de l'authentification.
 */

export const MIN_PASSWORD_LENGTH = 10

export const SignUpInput = z
  .object({
    /** Raison sociale de l'agence — c'est elle qui s'imprimera sur les contrats. */
    agencyName: z.string().trim().min(2).max(120),
    city: z.string().trim().min(1).max(80),

    contactPhone: z
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

    /** La personne qui ouvre le compte, et qui en sera propriétaire. */
    fullName: z.string().trim().min(2).max(120),
    email: z.email().max(180),
    password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
    passwordConfirm: z.string().min(MIN_PASSWORD_LENGTH).max(200),

    /**
     * Code d'offre. VÉRIFIÉ en base côté serveur, jamais cru sur parole : sans ce
     * contrôle, une requête forgée ouvrirait l'offre illimitée à prix nul.
     */
    planCode: z.string().trim().min(1).max(40),
    locale: z.enum(LOCALES),

    /** Leurre anti-robot. Rempli = requête ignorée en silence. */
    website: z.string().max(200).optional(),
  })
  /*
   * La confrontation des deux mots de passe est une règle du SCHÉMA, et pas une
   * vérification de l'écran. L'écran la fait aussi, pour répondre tout de suite ; mais
   * c'est celle-ci qui protège, parce que c'est la seule que personne ne peut sauter.
   */
  .refine((value) => value.password === value.passwordConfirm, {
    message: 'password_mismatch',
    path: ['passwordConfirm'],
  })

export type SignUpInputType = z.input<typeof SignUpInput>

/**
 * Identifiant d'URL de l'agence, dérivé de sa raison sociale.
 *
 * Fonction PURE et testable : c'est elle qui décide de ce qu'on trouvera dans les
 * adresses, et « Location Atlas & Fils (Casa) » ne doit pas y entrer tel quel.
 *
 * Les diacritiques sont dépliés par `normalize('NFD')` puis retirés, de sorte que
 * « Réda » et « Reda » produisent le même identifiant. L'arabe, lui, ne survit pas à
 * cette réduction — c'est voulu : un slug vide retombe sur le repli plus bas, et
 * l'unicité est de toute façon garantie par le suffixe ajouté côté serveur.
 */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  return slug.length >= 2 ? slug : 'agence'
}
