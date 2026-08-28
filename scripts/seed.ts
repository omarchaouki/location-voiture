/**
 * Peuple les deux espaces de démonstration.
 *
 *   pnpm seed
 *
 * Il crée les organisations si elles n'existent pas, puis les remplit d'une agence
 * marocaine complète : douze voitures, huit clients, des contrats en cours, en retard
 * et à venir, des échéances qui tombent cette semaine, deux amendes, cinq boîtiers.
 *
 * **Rejouable** : relancer la commande vide et recompose. C'est la même fonction que
 * la réinitialisation nocturne — un seul chemin, donc un seul comportement à connaître.
 *
 * Ce script ne crée AUCUN compte utilisateur : l'accès aux espaces de démonstration
 * passe par une invitation depuis `/admin`, comme pour un vrai client. Il n'existe
 * pas de porte dérobée réservée à la démo.
 */

import { eq } from 'drizzle-orm'

import { closeDb, createDb, resolveDatabaseUrl } from '~/db/client'
import { organizations } from '~/db/schema/auth'
import { DEMO_SLUGS, resetAllDemoOrganizations } from '~/server/demo/reset'
import { businessCivilDate } from '~/i18n/format'

const NAMES: Record<string, string> = {
  'demo-atlas': 'Atlas Cars (démonstration)',
  'demo-sahara': 'Sahara Location (démonstration)',
}

const db = createDb(resolveDatabaseUrl())

for (const slug of DEMO_SLUGS) {
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1)

  if (existing[0]) continue

  await db.insert(organizations).values({
    id: crypto.randomUUID(),
    name: NAMES[slug] ?? slug,
    slug,
    createdAt: new Date(),
    planCode: 'pro',
    status: 'active',
    // LE drapeau : c'est lui qui coupe les envois réels, les paiements et les exports
    // de masse (docs/DOMAIN.md, invariant 11).
    isDemo: true,
    city: 'Casablanca',
    localeDefault: 'fr',
  })
  console.log(`organisation de démonstration créée : ${slug}`)
}

const today = businessCivilDate(new Date())
const result = await resetAllDemoOrganizations(db, today)

console.log(
  `${result.organizations} espace(s) de démonstration peuplé(s) au ${today} — ` +
    `${result.tablesCleared} tables vidées avant écriture.`,
)

// Sans ça le pool postgres-js garde ses sockets et le script ne rend jamais la main.
await closeDb(db)
