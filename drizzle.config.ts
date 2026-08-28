import { defineConfig } from 'drizzle-kit'

/** Dit CE QUI manque et OÙ le mettre. « undefined is not a string » ne le dit pas. */
function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL est absent. Copiez .env.example en .env et renseignez la chaîne de ' +
        'connexion Postgres du projet Supabase (Project Settings → Database → ' +
        'Connection string).',
    )
  }
  return url
}

/**
 * Postgres, partout — développement comme production (28/08/2026).
 *
 * `DATABASE_URL` pointe sur le Postgres de Supabase. Une remarque qui coûte cher si on
 * l'oublie : **drizzle-kit doit passer par la connexion DIRECTE** (port 5432), jamais
 * par le pooler en mode transaction (6543). Une migration crée des types, pose des
 * verrous et enchaîne des ordres dans une seule session ; un pooler qui rend la
 * connexion à quelqu'un d'autre entre deux ordres laisse la base à moitié migrée.
 * D'où `DIRECT_URL`, qui prime ici et n'est lu que par cet outil.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DIRECT_URL ?? requireDatabaseUrl(),
  },
  strict: true,
  verbose: true,
})
