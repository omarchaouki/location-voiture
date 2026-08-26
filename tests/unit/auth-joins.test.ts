import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '~/db/client'
import { createTestDb } from '../helpers/db'
import { bootstrapAdmin, captureNotifications, createTestAuth } from '../helpers/auth'
import { countQueries } from '../helpers/queries'

/**
 * `advanced.database.joins` — la mesure qui décide.
 *
 * Better Auth annonce un `/get-session` « 2 à 3× plus rapide » avec les jointures.
 * En Phase 2 on l'a laissé à `false` faute de `relations()` déclarées, en écrivant
 * qu'on remesurerait ici plutôt que de faire confiance à une phrase de documentation
 * (docs/DECISIONS.md §11.3).
 *
 * Ce fichier est cette mesure, et il en fait une RÉGRESSION : si le gain disparaît à
 * une montée de version, le test tombe et la décision se rediscute. Un réglage de
 * performance qu'aucun test ne surveille redevient une supposition dès le mois suivant.
 *
 * Ce qu'on compte : les allers-retours avec la base pour une vérification de session
 * — l'opération la plus fréquente du produit, exécutée à chaque requête authentifiée.
 */

let db: Db

beforeEach(() => {
  db = createTestDb()
  captureNotifications()
})

/** Ouvre une session réelle, puis compte les requêtes d'une vérification de session. */
async function measure(joins: boolean): Promise<{ queries: number; email: string }> {
  const auth = createTestAuth(db, { joins })
  // Le compte de plateforme : le seul qui se crée sans invitation, et le chemin
  // qu'emprunte réellement `pnpm admin:create`.
  const user = await bootstrapAdmin(db, auth, {
    email: 'admin@registre.ma',
    password: 'correct-horse-battery',
    name: 'Omar',
  })

  // On ne compte PAS l'inscription : ce qui nous intéresse est la lecture répétée.
  const counter = countQueries(db)
  const session = await auth.api.getSession({ headers: user.headers })
  const queries = counter.count
  counter.stop()

  expect(session?.user.id).toBe(user.userId)
  return { queries, email: session?.user.email ?? '' }
}

describe('jointures de l’adaptateur', () => {
  it('renvoient la MÊME session, avec moins de requêtes', async () => {
    const withoutJoins = await measure(false)

    db = createTestDb()
    const withJoins = await measure(true)

    // La session doit décrire la même personne : un chemin plus rapide qui renvoie
    // autre chose n'est pas une optimisation, c'est un bug. (Les identifiants, eux,
    // diffèrent : chaque mesure part d'une base neuve.)
    expect(withJoins.email).toBe(withoutJoins.email)

    // Le gain annoncé, vérifié plutôt que cru.
    console.log(
      `/get-session : ${withoutJoins.queries} requête(s) sans jointures, ` +
        `${withJoins.queries} avec.`,
    )
    expect(withJoins.queries).toBeLessThan(withoutJoins.queries)
  })

  /**
   * Le vrai risque des jointures n'est pas la vitesse, c'est le SILENCE : sans
   * `relations()` déclarées, l'adaptateur échoue sur « Cannot read properties of
   * undefined (reading 'referencedTable') ». Ce test échouerait bruyamment si
   * quelqu'un retirait les relations de `src/db/schema/auth.ts`.
   */
  it('fonctionnent, donc les relations sont bien déclarées', async () => {
    const auth = createTestAuth(db, { joins: true })
    const user = await bootstrapAdmin(db, auth, {
      email: 'compta@registre.ma',
      password: 'correct-horse-battery',
      name: 'Nadia',
    })

    const session = await auth.api.getSession({ headers: user.headers })
    expect(session?.user.email).toBe('compta@registre.ma')
    expect(session?.session.token).toBeTruthy()
  })
})
