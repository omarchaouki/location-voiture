/**
 * Applique les migrations à la base de développement.
 *
 *   pnpm db:migrate
 *
 * En production (Postgres/Supabase) ce script sera remplacé par `drizzle-kit migrate`
 * exécuté au déploiement — voir docs/MIGRATION-SUPABASE.md (Phase 12).
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import { createDb, resolveDatabaseFile } from '~/db/client'
import { ensurePlanFeatures, ensurePlans } from '~/server/plan'

const file = resolveDatabaseFile()
const db = createDb(file)

migrate(db, { migrationsFolder: './drizzle' })

/*
 * La matrice des fonctionnalités par plan est posée ici, après les migrations.
 * Ce n'est PAS une migration : c'est de la donnée commerciale, qu'un gérant de
 * plateforme doit pouvoir changer en base sans qu'un déploiement la réécrive.
 * `ensurePlanFeatures` n'insère que ce qui manque.
 */
const seededPlans = await ensurePlans(db)
const seeded = await ensurePlanFeatures(db)

console.log(`Migrations appliquées sur ${file}`)
if (seededPlans > 0) console.log(`${seededPlans} offre(s) posée(s)`)
if (seeded > 0) console.log(`${seeded} ligne(s) de plan_features posée(s)`)
