# Flotta — SaaS de gestion pour loueurs de voitures (Maroc)

Réponds-moi en **français**. Code, noms de fichiers et commentaires en **anglais**… sauf les
commentaires explicatifs, qui sont en français comme le reste du projet.

## Commandes

```
pnpm dev          pnpm build          pnpm start
pnpm typecheck    pnpm lint           pnpm test
pnpm db:local     (Postgres local, sans Docker — le laisser tourner)
pnpm db:generate  pnpm db:migrate     pnpm db:studio
pnpm check:tokens (contrastes)        pnpm check:hardcoded (chaînes, RTL, ombres, cloisonnement)
pnpm check:budget (poids du paquet client, après `pnpm build`)
pnpm seed         pnpm demo:reset     (espaces de démonstration partagés)
pnpm demo:fill --org <slug> [--vehicles 30 --customers 100 --history 3]
pnpm demo:purge --org <slug> --confirm <slug>
```

`demo:fill` et `demo:purge` visent une organisation ORDINAIRE — un compte d'essai qu'on
veut éprouver —, pas les deux espaces partagés de `seed`. `fill` efface avant d'écrire
(les plaques et les références de contrat sont uniques par organisation), sème à la
taille demandée, recalcule les compteurs et lance le balayage d'alertes. `purge` rend
l'agence à zéro. Les deux ÉPARGNENT l'abonnement, les membres et l'organisation :
`PurgeScope` dans `src/server/demo/reset.ts` dit ce qui relève du compte et ce qui
relève de l'agence. Le garde-fou n'est pas un `--yes` mais le slug de la cible, retapé.

Aucun script n'est déclaré tant qu'il n'existe pas. `test:e2e` reste à venir : aucun
parcours Playwright n'est écrit à ce jour, et c'est le manque le plus ancien du projet.

## Base : Postgres partout (Supabase)

Il n'y a plus de SQLite depuis le 28/08/2026. `pnpm dev` exige un vrai Postgres :
`pnpm db:local` en fournit un sur `127.0.0.1:5433` sans Docker ni installation (PGlite
derrière une prise TCP), avec **`DATABASE_POOL_MAX=1` obligatoire** — il ne sert qu'une
connexion à la fois. Les tests, eux, montent leur propre Postgres en mémoire.

Deux chaînes de connexion, et elles ne sont PAS interchangeables : `DATABASE_URL` passe
par le pooler Supabase (6543, mode transaction) et sert l'application ; `DIRECT_URL`
passe en direct (5432) et ne sert QU'aux migrations — un pooler qui rend la connexion
entre deux ordres laisse une migration appliquée à moitié. Déploiement : `docs/DEPLOY.md`.

## Les 8 règles de portabilité, qui ont permis la bascule

1. Clé primaire `text` UUID v4 généré par l'application. Jamais de séquence.
2. Dates : `text` ISO 8601 UTC (`*_at`) ou date civile `YYYY-MM-DD` (`*_on`).
3. Booléens : `boolean` natif. (C'était `integer` 0/1 du temps de SQLite.)
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

- **Aucune chaîne en dur** dans un composant : tout passe par `t('clé')`, et les quatre langues
  (`fr`, `ar`, `en`, `es`) sont remplies en même temps. `tests/unit/i18n-parity.test.ts` échoue sinon —
  il est piloté par `LOCALES`, donc une cinquième langue entre dans le contrôle sans qu'on y pense.
  L'espagnol n'est pas décoratif : quatorze kilomètres séparent Tarifa de Tanger.
- **Aucune propriété physique** : `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`/`text-start`, jamais
  `ml-`, `pr-`, `left-`, `text-left`.
- **Aucune ombre** écrite à la main. Trois jetons, et trois seulement : `shadow-control`
  sur les boutons et les champs, `shadow-card` sur les cartes, `--shadow-overlay` sur la couche
  flottante (`src/ui/shadcn/`).
- **UN seul jeu d'icônes tiers** : `lucide-react`, pour l'interface (chevrons, croix, coches).
  Heroicons et react-icons sont refusés — deux jeux, ce sont deux graisses de trait dans la même
  barre. Les objets du MÉTIER restent dessinés à la main dans `src/ui/icons/` : voiture, clé,
  bidon d'huile, plaque.
- **Aucun `Intl` direct** : tout passe par `src/i18n/format.ts` (locale `ar-MA`, jamais `ar` ;
  `es-ES`, jamais `es` — `es-MX` sépare les milliers à l'anglaise).
- **Les noms de jetons sont ceux de shadcn/ui**, les valeurs sont celles du produit : **bleu et
  blanc**, une seule teinte 250–262 en OKLCH qui traverse aussi les gris. `--background`,
  `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`, plus `--warning` et
  `--success` que shadcn ne livre pas et dont un loueur a besoin. Couleurs uniquement par jeton de
  RÔLE, jamais littérales, et jamais ailleurs que dans `src/styles/tokens.css`.
- **Les cibles font 44 px** (`--tap-target`) : boutons, lignes cliquables, onglets, navigation.
  Ce n'est pas du style — l'écran principal du produit est un téléphone posé sur un comptoir.
- **Les champs font `--control-h`** : 40 px à la souris, 44 px sur pointeur grossier. Quatorze
  champs à 44 px font deux écrans. Les boutons lisent le même jeton, pour tomber au pixel sur la
  hauteur du champ d'à côté.
- **Un contrôle ne se dessine qu'à un seul endroit** : `CONTROL` dans `src/ui/shadcn/field.tsx`.
  `src/ui/forms/fields.tsx` l'habille, le combobox l'importe par `controlClass()`, les écrans
  n'écrivent aucune classe de champ. Il y avait quatre copies divergentes avant le 27/08/2026.
- **Au-delà de huit champs, le formulaire passe en ÉTAPES** (`src/ui/forms/steps.tsx`). Les étapes
  restent MONTÉES, cachées en CSS : `new FormData(form)` ramasse tout, revenir en arrière ne perd
  rien, et le `noValidate` posé par `formProps` est obligatoire — un champ `required` invisible
  fait échouer la soumission sans aucun message. La validation se fait étape par étape, pendant
  que l'étape est visible.
- **Trois à quatre réponses à comparer = `ChoiceGroup`**, pas un `<select>` (`src/ui/forms/
  choice-group.tsx`). Ce sont de vrais boutons radio, cachés : le clavier, le groupement et
  `required` viennent du navigateur, l'état coché se lit en CSS.
- **L'impression se pilote par `data-print`**, jamais par `print:hidden` / `print:block`. Ces
  utilitaires n'ont aucune spécificité de plus que ceux qu'ils doivent battre (`lg:flex` sur la
  barre latérale, `inline-flex` sur un bouton) : qui gagne dépend de l'ordre des variantes
  Tailwind, et ça ne se découvre qu'une feuille à la main. `data-print="hide"` pour ce qui
  appartient à l'application, `data-print="only"` pour ce qui n'existe que sur le papier ; les
  deux règles sont dans `@media print` d'`app.css`, en `!important` assumé.
- **« Lu » n'est pas « traité ».** La PASTILLE de la rubrique « Alertes » compte les alertes
  ACTIVES et NON LUES par la personne connectée (`alert_reads`, une ligne par alerte et par
  utilisateur). `acknowledged` est un acte métier partagé par l'agence ; les câbler ensemble ferait
  de « tout marquer comme lu » une déclaration que huit échéances sont réglées.
- **Un seul centre de notifications**, la page `/alertes`. Il y a eu une cloche séparée dans
  l'en-tête pendant une demi-journée : deux portes vers le même sujet obligent à choisir laquelle
  regarder, et la moitié des gestes se font au mauvais endroit. Le sondage vit dans la coquille
  (`useNotifications`, une minute) et descend par contexte.
- **L'offre ne se change pas en libre-service.** Le client DÉPOSE une demande motivée
  (`plan_change_requests`), la plateforme tranche depuis `/admin`. C'est le seul chemin qui écrit
  `organizations.plan_code` après la création d'une agence — donc le seul qui garantisse qu'un
  changement d'offre laisse un motif et un auteur.
- **L'INSCRIPTION, elle, est libre et instantanée** (`/$lang/inscription`, depuis le 29/08/2026).
  Elle monte le compte, l'organisation, l'appartenance, l'abonnement d'essai et les compteurs d'un
  geste, puis ouvre la session. L'endpoint d'inscription de Better Auth reste fermé : il n'accepte
  que les adresses ouvertes le temps d'une création par le serveur — la fenêtre porte L'ADRESSE, pas
  un booléen (`src/auth/server.ts`). Deux mois d'essai sur toutes les offres.
- **Un compte se crée aussi À LA MAIN, avec son mot de passe** (`/$lang/app/equipe`). L'invitation
  par courriel reste ; elle ne suffit pas à une agence où trois agents partagent la boîte du gérant.
  Le quota d'utilisateurs de l'offre s'applique, et la dernière personne `owner` ne peut être ni
  retirée ni rétrogradée.
- **Les fichiers passent par `src/server/storage/`**, jamais par `node:fs` écrit à la main. Toute
  clé commence par `org/<orgId>/` : c'est ce qui permet à `/api/fichiers/*` de refuser en une
  comparaison de chaîne, et un fichier d'une autre organisation rend **404**. Le SVG est refusé (du
  XML qui peut porter un script). Les images sont redimensionnées PAR LE NAVIGATEUR avant l'envoi
  (`src/ui/forms/image-field.tsx`) ; le serveur revérifie, parce qu'un client peut mentir.
- **Le modèle de contrat est un tableau de BLOCS, jamais du HTML** (`src/core/contract-template.ts`).
  Rien n'est rendu en `dangerouslySetInnerHTML` : une balise tapée dans une clause s'imprime comme
  du texte. Les variables s'écrivent `{{customer.name}}`, la liste est fermée, et une variable
  inconnue reste affichée telle quelle plutôt que de s'effacer en silence.
- Les tarifs et les quotas vivent en base (`plans`), jamais dans le JSX. La grille du 29/08/2026 est
calée sur le concurrent direct et le dépasse sur chaque axe — 89/179/279/449 MAD, 10/30/60/∞
véhicules, essai de **60 jours partout** (docs/DECISIONS.md D-11). Changer un prix est une ÉCRITURE,
pas un déploiement : `ensurePlans()` ne pose que ce qui manque.

`pnpm check:tokens` mesure les contrastes réels dans les deux thèmes. Il a d'ailleurs attrapé
  deux valeurs par défaut de shadcn qui échouent en clair — `--muted-foreground` et `--input` —,
  foncées ici pour tenir WCAG.

## Deux pièges vérifiés, à ne pas réintroduire

- `ar` et `ar-MA` n'ont pas les mêmes séparateurs décimaux : un montant mal formaté se lit à un
  facteur 1000 près.
- `Africa/Casablanca` repasse à **UTC+0 pendant le Ramadan**. Jamais d'offset fixe : les heures
  locales se calculent via `businessParts()` / `businessCivilDate()`.

## Où lire le reste

`docs/DECISIONS.md` (choix et écarts, avec sources datées) · `docs/DOMAIN.md` (modèle et invariants)
· `docs/DESIGN.md` (direction artistique et jetons) · `docs/DEPLOY.md` (Supabase et Lightsail)
· `docs/AUDIT.md` (auto-évaluations de phase).
Les procédures détaillées sont dans `.claude/skills/`.
