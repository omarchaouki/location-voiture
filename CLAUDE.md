# Registre — SaaS de gestion pour loueurs de voitures (Maroc)

Réponds-moi en **français**. Code, noms de fichiers et commentaires en **anglais**… sauf les
commentaires explicatifs, qui sont en français comme le reste du projet.

## Commandes

```
pnpm dev          pnpm build          pnpm start
pnpm typecheck    pnpm lint           pnpm test
pnpm db:generate  pnpm db:migrate     pnpm db:studio
pnpm check:tokens (contrastes)        pnpm check:hardcoded (chaînes, RTL, ombres, cloisonnement)
pnpm check:budget (poids du paquet client, après `pnpm build`)
pnpm seed         pnpm demo:reset     (espaces de démonstration)
```

Aucun script n'est déclaré tant qu'il n'existe pas. `test:e2e` reste à venir : aucun
parcours Playwright n'est écrit à ce jour, et c'est le manque le plus ancien du projet.

## Les 8 règles de portabilité (SQLite en dev → Postgres en prod)

1. Clé primaire `text` UUID v4 généré par l'application. Jamais d'AUTOINCREMENT.
2. Dates : `text` ISO 8601 UTC (`*_at`) ou date civile `YYYY-MM-DD` (`*_on`).
3. Booléens : `integer` 0/1, exposés via `mode: 'boolean'`.
4. Argent : **entiers en centimes** + `currency` par ligne. Jamais de flottant.
5. Enums : `text` + Zod. JSON : `text` sérialisé, parsé par Zod au bord.
6. Aucun SQL brut hors migrations et hors `aliveOnly` (index partiels).
7. Toute table métier porte `id`, `org_id`, `created_at`, `updated_at`, `deleted_at`.
8. Soft delete partout. Aucun `DELETE` hors purges documentées.

## Cloisonnement — la règle qui prime sur tout

- Un repository se construit par `forOrg(db, ctx)` / `vehicleRepository(db, ctx)` et **capture le
  `orgId`**. Aucune fonction n'accepte de requête sans `TenantContext`. N'ajoute jamais de signature
  qui le rendrait optionnel.
- Aucun accès `db.select(...)` hors de `src/db/repositories/`. **Vérifié** par
  `pnpm check:hardcoded`, qui déduit la liste des tables cloisonnées du schéma ; deux
  tables de plateforme y échappent, nommées dans le script.
- Ressource d'une autre organisation → **404**, jamais 403.
- Toute nouvelle entité entre automatiquement dans `tests/unit/tenant-isolation.test.ts` (registre
  déduit du schéma). Si le test ne la voit pas, c'est que la table n'est pas cloisonnée.

## Interface

- **Aucune chaîne en dur** dans un composant : tout passe par `t('clé')`, et les trois langues
  (`fr`, `ar`, `en`) sont remplies en même temps. `tests/unit/i18n-parity.test.ts` échoue sinon.
- **Aucune propriété physique** : `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`, jamais
  `ml-`, `pr-`, `left-`, `text-left`.
- **Aucune ombre** écrite à la main : `shadow-card` sur les cartes, `--overlay-shadow` dans
  `src/ui/overlay/`, et rien d'autre. La structure est portée par les filets (`--rule`).
- **Aucune bibliothèque d'icônes** : le jeu est maison, dans `src/ui/icons/`.
- **Aucun `Intl` direct** : tout passe par `src/i18n/format.ts` (locale `ar-MA`, jamais `ar`).
- Couleurs uniquement par jeton de rôle (`--ink`, `--rule`, `--stamp`…), jamais littérales.

## Deux pièges vérifiés, à ne pas réintroduire

- `ar` et `ar-MA` n'ont pas les mêmes séparateurs décimaux : un montant mal formaté se lit à un
  facteur 1000 près.
- `Africa/Casablanca` repasse à **UTC+0 pendant le Ramadan**. Jamais d'offset fixe : les heures
  locales se calculent via `businessParts()` / `businessCivilDate()`.

## Où lire le reste

`docs/DECISIONS.md` (choix et écarts, avec sources datées) · `docs/DOMAIN.md` (modèle et invariants)
· `docs/DESIGN.md` (direction artistique et jetons) · `docs/AUDIT.md` (auto-évaluations de phase).
Les procédures détaillées sont dans `.claude/skills/`.
