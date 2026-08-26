import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import * as schema from './schema'

/**
 * Connexion à la base.
 *
 * SQLite en développement (option B), Postgres en production. Ce fichier est l'un
 * des trois seuls que la bascule touchera, avec `drizzle.config.ts` et les fichiers
 * de schéma — parce que tout le reste du code passe par `src/db/repositories/`.
 */

const DEFAULT_FILE = './data/dev.db'

export function resolveDatabaseFile(): string {
  const url = process.env.DATABASE_URL ?? DEFAULT_FILE
  return url.startsWith('file:') ? url.slice('file:'.length) : url
}

export function createDb(file: string = resolveDatabaseFile()) {
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true })
  }

  const sqlite = new Database(file)

  // Exigé par la charte : sans cela SQLite ignore silencieusement les clés étrangères.
  sqlite.pragma('foreign_keys = ON')
  // WAL : lectures concurrentes pendant une écriture. Ne remplace pas le MVCC de
  // Postgres — les bugs de concurrence réels ne se reproduiront qu'après la bascule.
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')

  return drizzle(sqlite, { schema })
}

export type Db = ReturnType<typeof createDb>

let instance: Db | undefined

/** Instance partagée du processus. Les tests créent la leur avec `createDb(':memory:')`. */
export function getDb(): Db {
  instance ??= createDb()
  return instance
}
