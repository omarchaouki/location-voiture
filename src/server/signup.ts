import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'

import { getAuth } from '~/auth/server'
import { SignUpInput } from '~/core/schemas/signup'
import { getDb } from '~/db/client'
import type { SignUpRefusal } from './signup-intake'

/**
 * INSCRIPTION LIBRE — le second point d'écriture public du produit.
 *
 * Ce fichier ne contient QUE la server function. Le travail vit dans
 * `src/server/signup-intake.ts`, qui importe la base, l'authentification et deux
 * repositories : une fonction exportée à côté d'un gestionnaire n'est pas retirée du
 * paquet client, et la page d'inscription importe ce module-ci.
 */

export type SignUpResult = { ok: true } | { ok: false; reason: SignUpRefusal }

/**
 * Le refus ne LÈVE pas, il se rend.
 *
 * Une adresse déjà prise n'est pas une panne : c'est une réponse, et l'écran doit
 * pouvoir proposer d'aller se connecter plutôt que d'afficher « une erreur est
 * survenue ». Les vraies pannes, elles, remontent en exception comme partout ailleurs.
 */
export const signUpAgency = createServerFn({ method: 'POST' })
  .validator(SignUpInput)
  .handler(async ({ data }): Promise<SignUpResult> => {
    const { registerAgency } = await import('./signup-intake')
    const outcome = await registerAgency(getDb(), getAuth(), data, { now: new Date() })

    if (!outcome.ok) return outcome

    /*
     * LES COOKIES DE SESSION, posés sur la réponse de la server function.
     *
     * C'est ce qui fait la différence entre « votre compte est créé, connectez-vous »
     * et un espace déjà ouvert. Sans cette ligne, l'inscription réussirait en base et
     * la personne se retrouverait devant le formulaire de connexion, à ressaisir le
     * mot de passe qu'elle vient de choisir.
     *
     * `getSetCookie()` puis `setResponseHeader` avec le TABLEAU entier : Better Auth
     * en pose plusieurs, et n'en reposer qu'un revient à n'en poser aucun. Voir
     * `src/server/cookies.ts`.
     */
    if (outcome.cookies.length > 0) setResponseHeader('set-cookie', outcome.cookies)

    return { ok: true }
  })
