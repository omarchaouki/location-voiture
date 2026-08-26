---
name: feature-slice
description: Utiliser quand tu ajoutes une fonctionnalité de bout en bout à ce projet — nouvelle entité, nouvel écran, nouveau formulaire, nouvelle server function. Donne la procédure complète, toujours la même, du schéma Drizzle jusqu'au test.
---

# Ajouter une fonctionnalité — la route unique

Toujours dans cet ordre. Sauter une étape, c'est livrer une fonctionnalité à moitié branchée.

## 1. Schéma (`src/db/schema/<domaine>.ts`)

```ts
export const things = sqliteTable('things', {
  ...orgColumns,                       // id, org_id, created_at, updated_at, deleted_at
  vehicleId: text('vehicle_id'),
  amountCents: cents('amount_cents'),  // argent = entier en centimes
  dueOn: civilDate('due_on'),          // échéance = date civile, pas un instant
  isActive: bool('is_active').notNull().default(true),
}, (table) => [
  index('things_org_idx').on(table.orgId, table.deletedAt),
])
```

Exporter depuis `src/db/schema/index.ts`, puis `pnpm db:generate && pnpm db:migrate`.
Vérifier le SQL généré avant de continuer : un index manquant ne se voit qu'en production.

## 2. Repository (`src/db/repositories/<entité>.ts`)

```ts
export function thingRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<ThingRow>(db, ctx, things)
  return { ...base, /* méthodes métier, construites sur base.list/insert/update */ }
}
```

**Jamais** de fonction exportée sans `ctx`. **Jamais** de `db.select()` écrit à la main : passer par
`base.list(where)`, qui applique le filtre d'organisation. Voir la skill `tenant-safety`.

## 3. Schéma Zod partagé (`src/core/schemas/<entité>.ts`)

Un seul schéma pour le client et le serveur. Zod 4 : `z.email()`, pas `z.string().email()`.

## 4. Server function (`src/server/<domaine>.ts`)

```ts
export const createThing = createServerFn({ method: 'POST' })
  .middleware([tenantMiddleware])   // fournit ctx depuis la SESSION, jamais depuis l'URL
  .validator(CreateThingInput)      // `.validator()`, PAS `.inputValidator()` (déprécié)
  .handler(async ({ data, context }) => {
    const repo = thingRepository(getDb(), context.tenant)
    return repo.create(data)
  })
```

Trois vérifications distinctes côté serveur : **appartenance à l'organisation**, **rôle**, **plan**
(`can(org, 'clé')` sur `plan_features` — jamais `if (plan === 'pro')`).
Quota dépassé → message clair avec la limite atteinte et le plan requis, jamais une erreur technique.

## 5. Query / route

`queryOptions` co-localisé avec la fonctionnalité, consommé dans un `loader` de route. Identifiants
d'URL en UUID. Ressource d'une autre organisation → `throw notFound()`.

## 6. Composants

Suivre la skill `design-system`. Aucun texte en dur.

## 7. Traductions — les TROIS langues en même temps

`src/i18n/locales/{fr,ar,en}/common.json`. Ajouter une clé en français seulement fait échouer
`tests/unit/i18n-parity.test.ts` — c'est voulu : un oubli devient un échec de build, pas du français
au milieu d'une page arabe. Vocabulaire de référence : `docs/DOMAIN.md` §2.

## 8. Squelette

Ajouter le squelette de l'écran dans `src/ui/skeletons/`, avec la géométrie exacte. Vérifier en
basculant l'écran entre squelette et contenu : rien ne doit sauter.

## 9. Tests

- La nouvelle table entre automatiquement dans `tests/unit/tenant-isolation.test.ts`.
- Logique pure (calcul, règle) → test dédié, à dates figées.
- Parcours critique → Playwright, **dont un passage en arabe**.

## 10. Avant de dire que c'est fini

```
pnpm typecheck && pnpm lint && pnpm test && pnpm check:hardcoded && pnpm check:tokens
```

Puis ouvrir l'écran dans le navigateur : clair/sombre, fr/ar, 360/1440. Tout stub restant est
marqué `TODO` **et** listé dans le rapport de fin de phase.
