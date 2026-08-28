/**
 * Applique les migrations à la base Postgres désignée par l'environnement.
 *
 *   pnpm db:migrate
 *
 * En développement comme au déploiement, c'est ce script qui fait foi : il migre PUIS
 * pose la matrice commerciale, dans cet ordre, et rend la main.
 *
 * **Il passe par la connexion DIRECTE** (`DIRECT_URL`, port 5432 de Supabase) et non par
 * le pooler en mode transaction : une migration enchaîne ses ordres dans une seule
 * session, et un pooler qui rend la connexion entre deux ordres laisse la base à moitié
 * migrée. Voir la même remarque dans `drizzle.config.ts`.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

import { resolveDatabaseUrl } from '~/db/client'
import * as schema from '~/db/schema'
import { ensurePlanFeatures, ensurePlans } from '~/server/plan'

const url = process.env['DIRECT_URL'] ?? resolveDatabaseUrl()

/*
 * `max: 1` : une migration est une suite d'ordres qui se tiennent. Deux connexions,
 * c'est deux sessions, donc deux verrous et un ordre d'application indéterminé.
 */
const client = postgres(url, { max: 1, prepare: false, connect_timeout: 20 })
const db = drizzle(client, { schema })

try {
  await migrate(db, { migrationsFolder: './drizzle' })

  /*
   * La matrice des fonctionnalités par plan est posée ici, après les migrations.
   * Ce n'est PAS une migration : c'est de la donnée commerciale, qu'un gérant de
   * plateforme doit pouvoir changer en base sans qu'un déploiement la réécrive.
   * `ensurePlanFeatures` n'insère que ce qui manque.
   */
  const seededPlans = await ensurePlans(db)
  const seeded = await ensurePlanFeatures(db)

  const host = new URL(url).host
  console.log(`Migrations appliquées sur ${host}`)
  if (seededPlans > 0) console.log(`${seededPlans} offre(s) posée(s)`)
  if (seeded > 0) console.log(`${seeded} ligne(s) de plan_features posée(s)`)
} finally {
  await client.end({ timeout: 5 })
}
