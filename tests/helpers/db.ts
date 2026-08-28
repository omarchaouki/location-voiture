import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

import type { Db } from '~/db/client'
import * as schema from '~/db/schema'
import type { TenantContext } from '~/db/tenant'

/**
 * Base Postgres EN MÉMOIRE, migrée, vide au début de chaque test.
 *
 * PGlite est un vrai Postgres compilé en WebAssembly, pas une imitation : les index
 * partiels, `on conflict`, les transactions et les types se comportent exactement comme
 * chez Supabase. C'était le point noir de SQLite — la suite passait au vert sur un moteur
 * que la production n'utilisait pas.
 *
 * ─── Pourquoi tout ce qui suit n'est PAS de l'excès de zèle ───────────────────────────
 *
 * La version naïve (un `new PGlite()` migré par test) mettait **16 secondes par test**.
 * Mesuré, le coût se répartit ainsi :
 *
 *     démarrage de PGlite ....... 8 700 ms   ← compilation du WASM + initdb
 *     migration des 47 tables ... 1 300 ms
 *     instantané (dump) .......... 320 ms
 *     restauration d'instantané . 1 600 ms   ← pas d'initdb : c'est tout le gain
 *
 * D'où deux décisions, dans cet ordre :
 *
 * 1. **Un instantané sur disque, partagé par tous les fichiers de test.** Vitest donne un
 *    processus par fichier ; sans cache, chacun repaierait les 10 secondes de démarrage.
 *    L'instantané est daté par l'empreinte des fichiers de `drizzle/` : générer une
 *    migration l'invalide toute seule, et personne n'a de cache à vider à la main.
 *
 * 2. **Une seule instance par fichier, vidée entre les tests.** Vider coûte 23 ms, contre
 *    1,6 s pour une restauration. L'isolement est le même : ce que le test précédent a
 *    écrit n'existe plus.
 */

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'pglite')

/** L'empreinte des migrations. Elle change, le cache devient caduc — sans intervention. */
function migrationsFingerprint(): string {
  const hash = createHash('sha256')
  for (const name of readdirSync('./drizzle').filter((f) => f.endsWith('.sql')).sort()) {
    hash.update(name)
    hash.update(readFileSync(join('./drizzle', name)))
  }
  return hash.digest('hex').slice(0, 16)
}

/** Construit l'instantané : démarrage, migration, dump. Payé une fois par machine. */
async function buildTemplate(path: string): Promise<Buffer> {
  const pg = new PGlite()
  await migrate(drizzle(pg, { schema }), { migrationsFolder: './drizzle' })
  const dump = await pg.dumpDataDir('none')
  await pg.close()

  const bytes = Buffer.from(await dump.arrayBuffer())

  /*
   * Écriture par fichier temporaire puis renommage : plusieurs processus de test peuvent
   * arriver ici en même temps sur un cache froid. Un `writeFileSync` direct laisserait un
   * instantané à moitié écrit que le voisin lirait comme s'il était complet.
   * Le renommage échoue sous Windows si la cible existe déjà — c'est le cas gagnant, un
   * autre processus a fini avant nous, et il n'y a rien à faire.
   */
  mkdirSync(CACHE_DIR, { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, bytes)
  try {
    renameSync(temporary, path)
  } catch {
    /* déjà posé par un autre processus */
  }

  return bytes
}

/**
 * Puits de requêtes du compteur de N+1 (tests/helpers/queries.ts).
 *
 * Il est posé ICI, à la construction, parce que Drizzle prend son journal en argument et
 * ne le remplace pas après coup. Rien ne s'exécute tant que personne n'a branché de
 * puits : le coût, en dehors de `queries.test.ts`, est une comparaison à `undefined`.
 */
let sink: ((sql: string) => void) | undefined

export function setQuerySink(next: ((sql: string) => void) | undefined): void {
  sink = next
}

let client: PGlite | undefined
let instance: Db | undefined
/** `delete from a; delete from b; …` — construit une fois, depuis le catalogue réel. */
let emptyAll: string | undefined

/**
 * Le `as unknown as Db` est le seul écart, et il est contenu ici : Drizzle donne un type
 * distinct par pilote alors que l'API de requête est identique. Faire remonter une union
 * de deux pilotes jusqu'aux vingt-trois signatures `(db: Db, ctx: TenantContext)` des
 * repositories coûterait bien plus cher que cette ligne, pour la même sécurité réelle.
 */
export async function createTestDb(): Promise<Db> {
  if (instance && client && emptyAll) {
    await client.exec(emptyAll)
    return instance
  }

  const path = join(CACHE_DIR, `template-${migrationsFingerprint()}.tar`)
  let bytes: Buffer
  try {
    bytes = readFileSync(path)
  } catch {
    bytes = await buildTemplate(path)
  }

  // `Uint8Array` et non `Buffer` : le type de Node laisse planer un `SharedArrayBuffer`,
  // que `BlobPart` refuse.
  client = await PGlite.create({ loadDataDir: new Blob([Uint8Array.from(bytes)]) })
  instance = drizzle(client, {
    schema,
    logger: {
      logQuery(query) {
        sink?.(query)
      },
    },
  }) as unknown as Db

  /*
   * Les tables sont lues dans le catalogue et non dans le schéma TypeScript : une table
   * ajoutée au schéma sans être vidée ici ferait fuir des lignes d'un test à l'autre, et
   * ce genre de fuite se manifeste par un test qui échoue SEULEMENT quand la suite entière
   * tourne. La table de suivi de Drizzle vit dans son propre schéma, elle n'y est pas.
   */
  const tables = await client.query<{ name: string }>(
    `select quote_ident(tablename) as name from pg_tables where schemaname = 'public'`,
  )

  /*
   * `DELETE`, et pas `TRUNCATE` : mesuré, 23 ms contre 299 ms pour les 47 tables. Sur des
   * tables presque vides, `TRUNCATE` paie la troncature des fichiers et une écriture de
   * catalogue par table, là où `DELETE` ne fait que marquer quelques lignes.
   *
   * L'ordre est indifférent parce que le schéma ne déclare AUCUNE clé étrangère : c'est
   * un choix assumé (voir `src/db/schema/_shared.ts`), l'intégrité étant portée par la
   * couche repository. Le jour où une clé étrangère apparaîtra, ce `delete` en vrac
   * échouera bruyamment — et c'est la bonne façon d'échouer.
   */
  emptyAll = tables.rows.map((row) => `delete from ${row.name};`).join(' ')

  return instance
}

export function tenant(orgId: string, overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    orgId,
    userId: `user-${orgId}`,
    role: 'owner',
    planCode: 'pro',
    impersonated: false,
    canWrite: true,
    isDemo: false,
    ...overrides,
  }
}
