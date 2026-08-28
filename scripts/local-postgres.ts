/**
 * UN POSTGRES LOCAL, sans Docker, sans installation.
 *
 *   pnpm db:local          (laisser tourner dans un terminal)
 *   pnpm db:migrate        (dans un autre)
 *   pnpm dev
 *
 * Depuis la bascule du 28/08/2026, le produit n'a plus de mode SQLite : `pnpm dev` exige
 * un vrai Postgres. Obliger chaque poste de développement à ouvrir un projet Supabase
 * serait payer un aller-retour réseau pour chaque requête, et partager une base entre
 * plusieurs personnes qui essaient des migrations.
 *
 * PGlite est Postgres compilé en WebAssembly ; `pglite-socket` lui met une prise TCP
 * devant, qui parle le VRAI protocole du serveur. `postgres-js`, Drizzle Kit et même
 * `psql` s'y connectent sans savoir la différence.
 *
 * Les données vivent dans `./data/pg`, hors du dépôt (`.gitignore`). Les effacer remet
 * la base à neuf ; `pnpm db:migrate && pnpm seed` la repeuple.
 *
 * ⚠ DEUX limites, à connaître avant de s'énerver.
 *
 * 1. **Une seule connexion à la fois.** PGlite est mono-session : un pool qui en ouvre
 *    plusieurs se fait couper (`read ECONNRESET`) dès qu'une page lance ses requêtes en
 *    parallèle — le tableau de bord de /admin en tire huit d'un coup. D'où
 *    `DATABASE_POOL_MAX=1` ci-dessous, obligatoire ici et seulement ici : Supabase, lui,
 *    est un vrai serveur multi-connexions.
 * 2. **Aucune authentification**, et c'est pour ça que l'écoute est limitée à
 *    `127.0.0.1`. Ce n'est pas un serveur de production, ce n'est pas un substitut à
 *    Supabase, et ça n'a rien à faire sur le Lightsail.
 */

import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

const PORT = Number(process.env['LOCAL_PG_PORT'] ?? 5433)
const DATA_DIR = process.env['LOCAL_PG_DIR'] ?? './data/pg'

const db = await PGlite.create({ dataDir: DATA_DIR })
const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' })

await server.start()

console.log(`Postgres local sur 127.0.0.1:${PORT} — données dans ${DATA_DIR}`)
console.log('')
console.log(`  DATABASE_URL=postgresql://postgres@127.0.0.1:${PORT}/postgres`)
console.log(`  DIRECT_URL=postgresql://postgres@127.0.0.1:${PORT}/postgres`)
console.log("  DATABASE_POOL_MAX=1   # obligatoire : PGlite ne sert qu'une connexion")
console.log('')
console.log('Ctrl+C pour arrêter.')

/*
 * PGlite écrit sur disque de façon différée : couper le processus sans fermer la base
 * peut laisser le répertoire dans un état que le démarrage suivant refusera de lire.
 */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      await server.stop()
      await db.close()
      process.exit(0)
    })()
  })
}
