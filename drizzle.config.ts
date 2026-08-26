import { defineConfig } from 'drizzle-kit'

/**
 * Dialecte SQLite en développement (option B du cahier des charges).
 *
 * La bascule vers Postgres est prévue à la fin de la Phase 2 (docs/DECISIONS.md §10) :
 * elle consiste à passer `dialect` en `postgresql`, `src/db/schema/*` de `sqlite-core`
 * à `pg-core`, et `better-auth` de `provider: 'sqlite'` à `'pg'`. Le reste du code ne
 * bouge pas, parce que la couche `src/db/repositories/` isole le dialecte.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./data/dev.db',
  },
  strict: true,
  verbose: true,
})
