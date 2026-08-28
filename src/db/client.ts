import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

/**
 * Connexion à la base.
 *
 * **Postgres partout depuis le 28/08/2026** — développement comme production, sur le
 * Postgres géré de Supabase. La bascule annoncée par docs/DECISIONS.md n'a touché que
 * trois fichiers hors schéma : celui-ci, `drizzle.config.ts` et `scripts/migrate.ts`.
 * Tout le reste du code passe par `src/db/repositories/`, qui isole le dialecte —
 * c'était le pari de la charte de portabilité, et il a tenu.
 *
 * Il n'y a plus de valeur par défaut. Une base absente doit ARRÊTER le processus, pas
 * le faire tomber en silence sur un fichier local qui n'existe plus.
 */

/** Dit CE QUI manque et OÙ le mettre. « undefined is not a string » ne le dit pas. */
export function resolveDatabaseUrl(): string {
  const url = process.env['DATABASE_URL']
  if (!url) {
    throw new Error(
      'DATABASE_URL est absent. Copiez .env.example en .env et renseignez la chaîne de ' +
        'connexion Postgres du projet Supabase (Project Settings → Database → ' +
        'Connection string).',
    )
  }
  return url
}

export function createDb(url: string = resolveDatabaseUrl()) {
  const client = postgres(url, {
    /*
     * OBLIGATOIRE derrière le pooler Supabase (port 6543, mode « transaction »).
     *
     * En mode transaction, une même connexion Postgres sert plusieurs clients à tour de
     * rôle : une requête préparée nommée par le client A reste dans la session et le
     * client B tombe dessus avec « prepared statement "s1" already exists ». La panne
     * n'apparaît pas au premier essai — elle attend qu'il y ait deux requêtes
     * concurrentes, donc la production et pas la machine de développement.
     */
    prepare: false,

    /*
     * Le petit Lightsail (1 Go) n'a rien à faire de trente connexions, et le pooler
     * Supabase en compte un quota. Dix suffisent largement à un SSR qui rend des pages.
     */
    max: Number(process.env['DATABASE_POOL_MAX'] ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,

    /*
     * Le TLS n'est PAS configuré ici : il vient du `?sslmode=require` porté par la
     * chaîne de connexion, que postgres-js lit tout seul (src/index.js, `query.sslmode`).
     * Le laisser dans l'URL, c'est garder UN seul endroit où l'accès à la base se décrit
     * — et pouvoir changer d'hébergeur sans toucher au code.
     */
  })

  return drizzle(client, { schema })
}

export type Db = ReturnType<typeof createDb>

let instance: Db | undefined

/** Instance partagée du processus. Les tests créent la leur — voir tests/helpers/db.ts. */
export function getDb(): Db {
  instance ??= createDb()
  return instance
}

/**
 * Ferme le pool. INDISPENSABLE dans les scripts en ligne de commande.
 *
 * better-sqlite3 était synchrone : le processus se terminait tout seul. Un pool
 * postgres-js garde des sockets ouvertes, et `pnpm seed` resterait suspendu après avoir
 * fini son travail — un script qui ne rend jamais la main a l'air d'un script planté.
 */
export async function closeDb(db: Db = getDb()): Promise<void> {
  await db.$client.end({ timeout: 5 })
  if (db === instance) instance = undefined
}
