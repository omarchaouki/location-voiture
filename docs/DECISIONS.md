# DECISIONS.md — Journal des décisions techniques

Produit : **plateforme SaaS de gestion pour sociétés de location de voitures (Maroc)**
Phase courante : **Phase 0 — recherche et cadrage. Aucun code applicatif écrit.**
Dernière mise à jour : **2026-08-21**

Ce document est la mémoire du projet. Toute décision qui contredit, complète ou dépasse le cahier
des charges y figure avec sa date, sa raison et sa source. Les décisions sont numérotées `D-xx` et
ne sont jamais supprimées : elles sont marquées `RÉVISÉE` ou `ANNULÉE`.

---

## 0. Méthode de vérification

Les numéros de version ci-dessous ne viennent pas de ma mémoire. Ils ont été lus le **2026-08-21**
directement sur le registre npm (`registry.npmjs.org`, endpoints `/<pkg>/latest` et
`/-/package/<pkg>/dist-tags`), et les points d'API ont été relus sur la documentation officielle.
Environnement local constaté : **Node v24.11.0**, **npm 11.6.1**, **pnpm absent**, dossier de
projet vide, **pas de dépôt git initialisé**.

### Versions réellement publiées au 2026-08-21

| Paquet | `latest` | Autres tags notables | Retenu | Note |
|---|---|---|---|---|
| `@tanstack/react-start` | **1.168.48** (publié 2026-08-19) | `pre` 1.168.33-pre.0 | 1.168.48 | peers : `vite >=7`, `react >=18 ou >=19` |
| `@tanstack/react-router` | **1.170.31** | — | 1.170.31 | épinglé en dur par react-start |
| `@tanstack/react-query` | **5.101.4** | — | 5.101.4 | — |
| `@tanstack/react-table` | **9.1.2** (publié 2026-08-09) | `beta` 9.0.0-beta.80 | 9.1.2 | voir **D-04** |
| `@tanstack/react-form` | **1.33.5** | — | 1.33.5 | — |
| `drizzle-orm` | **0.45.2** (publié 2026-03-27) | `rc` 1.0.0-rc.4, `beta` 1.0.0-beta.22 | **0.45.2** | voir **D-02** |
| `drizzle-kit` | **0.31.10** | — | 0.31.10 | — |
| `zod` | **4.4.3** | `canary` 4.5.0 | 4.4.3 | API v4 |
| `typescript` | **7.0.2** | `rc` 7.0.1-rc ; **6.0.3** stable | **6.0.3** | voir **D-01** |
| `typescript-eslint` | **8.67.0** | — | 8.67.0 | peer : `typescript >=4.8.4 <6.1.0` |
| `eslint` | **10.9.0** | — | 10.9.0 | — |
| `vite` | **8.2.2** | — | voir **D-03** | peer Start = `>=7` |
| `react` / `react-dom` | **19.2.8** | — | 19.2.8 | — |
| `better-auth` | **1.7.1** | — | 1.7.1 | plugin `organization` |
| `better-sqlite3` | **13.0.3** | — | 13.0.3 | dev uniquement |
| `@supabase/supabase-js` | **2.112.3** | — | 2.112.3 | Phase 12 |
| `stripe` | **22.5.0** | — | 22.5.0 | adaptateur, mode test |
| `i18next` | **26.4.0** | — | 26.4.0 | — |
| `react-i18next` | **17.0.12** | — | 17.0.12 | — |
| `maplibre-gl` | **6.5.0** | — | 6.5.0 | voir **D-08** |
| `vitest` | **4.1.11** | — | 4.1.11 | — |
| `@playwright/test` | **1.62.1** | — | 1.62.1 | — |
| `node-cron` | **4.6.0** | — | 4.6.0 | dev uniquement |
| `resend` | **6.21.0** | — | 6.21.0 | prod uniquement |
| `tailwindcss` | **4.3.3** | — | 4.3.3 | moteur CSS-first, directive `@theme` |

### API vérifiées (relecture de la documentation, pas de mémoire)

- **TanStack Start — server functions** : `import { createServerFn } from '@tanstack/react-start'`,
  chaînage `createServerFn({ method: 'POST' }).validator(schema).handler(async ({ data }) => …)`.
  `redirect()` et `notFound()` s'importent depuis `@tanstack/react-router` et se **lancent**
  (`throw redirect({ to: '/login' })`). Middleware composable ; un
  `createCsrfMiddleware({ filter })` est exposé par `@tanstack/react-start`.
  Conséquence : la validation Zod serveur exigée au §15 du cahier des charges se branche
  nativement via `.validator(...)`. On n'invente aucune couche maison.
- **TanStack Start — statut** : la 1.x est publiée sur le tag `latest` et le blog officiel la
  décrit comme **Release Candidate feature-complete**, 1.0 « peu après ». Risque assumé et suivi
  (**R-1**).
- **Better Auth — plugin `organization`** : organisations, membres, rôles (`owner` / `admin` /
  `member` par défaut, personnalisables), invitations par email et route d'acceptation,
  **expiration d'invitation par défaut 48 h, configurable** — à porter à **7 jours** (§5 du cahier
  des charges).

---

## D-01 — TypeScript **6.0.3**, pas 7.0.2 (pourtant la plus récente)

**Décision.** On épingle `typescript@6.0.3`.

**Pourquoi.** TypeScript 7.0 (GA le 8 juillet 2026) est le portage Go du compilateur : 8 à 12x plus
rapide, mais **il n'expose pas encore d'API programmatique stable**. Conséquence directe et
vérifiable sur le registre : `typescript-eslint@8.67.0` déclare
`peerDependencies.typescript = ">=4.8.4 <6.1.0"`. Autrement dit, **le lint typé ne fonctionne pas
sur TypeScript 7**. Le cahier des charges exige qu'à la fin de chaque phase `typecheck` **et**
`lint` soient propres : la 7.0 rend cette exigence impossible aujourd'hui. L'API stable est
annoncée pour la 7.1, « plusieurs mois » après la GA.

**Coût.** Compilation plus lente qu'elle ne pourrait l'être. Acceptable : le projet n'a pas encore
une ligne de code.

**Sortie.** Un seul champ de `package.json` à changer le jour où `typescript-eslint` publie une
majeure compatible 7.x. Aucune ligne de code métier n'en dépend. À réévaluer en Phase 6.

---

## D-02 — Drizzle **0.45.2**, pas la 1.0.0-rc

**Décision.** `drizzle-orm@0.45.2` + `drizzle-kit@0.31.10`.

**Pourquoi.** Le tag `latest` de `drizzle-orm` est 0.45.2 (publiée 2026-03-27). La branche 1.0
existe en `beta.22` / `rc.4` / `rc.5`, accompagnée d'une trentaine de tags de travail publiés en
parallèle : c'est une branche en mouvement, pas une cible pour un schéma de quarante tables qui
doit survivre à un changement de dialecte. Le risque n'est pas la 1.0 en soi, c'est de construire
les migrations sur une RC dont les snapshots changent encore.

**Coût.** On se prive des nouveautés 1.0, dont la refonte du relational query builder. Notre charte
de portabilité nous interdit de toute façon le SQL brut et nous pousse vers des requêtes simples :
l'écart réel est faible.

**Sortie.** La couche `src/db/repositories/` isole 100 % des appels Drizzle. Une montée en 1.0 se
fait dans ce seul dossier.

---

## D-03 — Vite : cible **8.2.2**, repli documenté sur 7.x

**Décision.** Démarrer sur `vite@8.2.2` (le `latest`), qui satisfait le peer `>=7.0.0` de
`@tanstack/react-start`. **Si** `@tanstack/start-plugin-core@1.171.38` montre le moindre défaut sur
Vite 8 (build SSR, manifest, worker), on épingle la dernière `7.x` et on l'écrit ici. Ce n'est pas
une hypothèse à trancher sur le papier : c'est une vérification à faire au premier `build` de la
Phase 1, et le rapport de Phase 1 doit dire laquelle des deux a été retenue.

---

## D-04 — TanStack Table **v9**, avec échappatoire

**Décision.** `@tanstack/react-table@9.1.2`.

**Pourquoi.** v9 est stable sur `latest` depuis le 2026-08-09. C'est une réécriture :
`useTable({ features, … })` remplace `useReactTable`, les modèles de lignes passent par des slots
`tableFeatures()`, l'état transite par `table.state` / `table.store` / atomes par tranche au lieu
de `getState()`, `data` et `columns` sont **readonly**, et plusieurs API sont renommées
(`column.getAggregationValue({ rows, maxDepth })`, `column.getAggregationFns()`). Le modèle de
features opt-in réduit le bundle, ce qui compte pour un tableau de 200 véhicules sur mobile.

**Risque assumé.** v9 a douze jours de stabilité au moment où j'écris, et la quasi-totalité des
exemples publics (dont ceux de shadcn) sont encore en v8. Atténuation : (1) le cahier des charges
§13 interdit shadcn tel quel, donc nous écrivons nos propres primitives de table de toute façon ;
(2) `useLegacyTable` depuis `@tanstack/react-table/legacy` accepte la forme v8 sur le moteur v9 et
sert de plan B **tableau par tableau**, sans rétrograder le projet entier.

**Signal d'arrêt.** Si, en Phase 3, le coût d'apprentissage de v9 dépasse deux jours, ce tableau
bascule en `useLegacyTable` et la bascule est notée ici.

---

## D-05 — Paiement : **Stripe est inutilisable depuis le Maroc**. Conséquences.

### Vérification du 2026-08-21

Stripe opère dans **46 pays** et **le Maroc n'en fait pas partie**. Il n'est pas possible d'ouvrir
un compte Stripe marocain ni de recevoir les versements sur un compte bancaire marocain, faute de
licence d'établissement de paiement au Maroc et du fait du contrôle des changes. Les sources
consultées sont datées de 2026 et concordent. **Rien n'a changé** par rapport à la prémisse du
cahier des charges.

L'écosystème local, lui, a bougé : **CMI** (Centre Monétique Interbancaire) reste la passerelle
historique et incontournable pour les cartes marocaines, avec une intégration d'un autre âge ;
**Payzone** propose une API REST moderne et gère le **paiement récurrent** ; des acteurs récents
(dont Chari Pay / ChariBaaS, présenté comme licencié Bank Al-Maghrib, avec API REST, Swagger et
sandbox) se positionnent en équivalent local de Stripe.

**Réserve d'honnêteté : les comparatifs de passerelles trouvés sont publiés par les fournisseurs
eux-mêmes.** Ils indiquent une direction, pas une preuve. Aucun de ces prestataires ne sera intégré
sans un test réel en sandbox, et le choix final est une décision commerciale et juridique qui
t'appartient, pas une décision de code.

### Architecture retenue (elle survit à tous les scénarios)

1. Une interface **`PaymentProvider`** : `createCheckout`, `openBillingPortal`, `getSubscription`,
   `cancel`, `resume`, `listInvoices`, `handleWebhook`.
2. **Trois implémentations**, dans cet ordre de livraison :
   - **`ManualPaymentProvider`** — virement, chèque, espèces, piloté depuis `/admin`.
     **C'est l'implémentation de référence, la seule réellement utilisable le premier mois.**
     Elle ne demande ni compte tiers, ni entité juridique étrangère.
   - **`StripePaymentProvider`** — complet, testé en mode test, prêt le jour où une entité éligible
     existe (LLC US, UK Ltd, ou Paddle en marchand de référence).
   - **`LocalGatewayPaymentProvider`** — interface plus documentation d'intégration CMI / Payzone,
     branchée quand un contrat marchand est signé.
3. **Aucune logique métier ne connaît Stripe.** L'application connaît `subscription.status`, `plan`
   et `current_period_end`. La base est la source de vérité de l'accès.

**Écart proposé (voir É-10).** Le cahier des charges place tout le paiement en Phase 9. J'y livre
**`ManualPaymentProvider` en premier et comme chemin nominal**, Stripe ensuite comme adaptateur
validé en mode test — tunnel complet, Checkout, Portal, webhooks idempotents, cartes de test, cas
d'échec inclus, comme demandé.

---

## D-06 — Facturation électronique DGI : information nouvelle, absente du cahier des charges

**Fait vérifié le 2026-08-21.** Le Maroc bascule en 2026 vers une **facturation électronique
obligatoire et progressive**, pilotée par la DGI, fondée sur l'article 145 du CGI, selon un modèle
de **clearance** : chaque facture doit transiter par la plateforme de la DGI et y être validée
avant d'être légalement émise. Formats annoncés : **UBL 2.1** ou **UN/CEFACT CII**. Déploiement par
paliers, grandes entreprises d'abord (CA supérieur à 50 M MAD), puis PME, puis auto-entrepreneurs.

**Pourquoi ça nous concerne deux fois.**

1. **Mes factures d'abonnement** à mes clients loueurs.
2. **Surtout** : les factures que **mes clients** émettent à leurs locataires depuis
   l'application. Une société qui facture 300 contrats par mois devra, à terme, les faire viser. Si
   le modèle de données n'est pas prêt, la mise en conformité sera une réécriture, pas une
   évolution.

**Décision.** Le modèle `invoices` est conçu **compatible UBL 2.1 dès la Phase 0** : émetteur
identifié (ICE, IF, RC, CNSS), acheteur identifié, lignes typées avec code de TVA, taux 20 % par
défaut mais **stocké par ligne**, numérotation **séquentielle continue par organisation et par
exercice garantie en base** (et non par le code applicatif), champs `legal_status`, `clearance_id`,
`clearance_at`, `clearance_payload` réservés. Une interface **`EInvoiceProvider`** est déclarée avec
une seule implémentation `NoopEInvoiceProvider` tant que la plateforme DGI n'est pas accessible.
**C'est un stub, il sera déclaré comme tel dans le rapport de phase.**

**Ce que je ne fais pas.** Aucune connexion DGI écrite en aveugle. Je réserve la place, c'est tout.

---

## D-07 — SQLite en dev / Postgres en prod : le vrai coût de l'option B

Le cahier des charges demande explicitement l'option B. Je l'applique. Voici ce qu'elle coûte,
sans enrobage.

### Ce qui casse au passage SQLite vers Postgres si on n'y prend pas garde

| Point | SQLite | Postgres | Notre parade |
|---|---|---|---|
| Dialecte Drizzle | `drizzle-orm/sqlite-core` | `drizzle-orm/pg-core` | constructeurs de colonnes maison, un seul point de bascule |
| Types | ni `boolean`, ni `timestamptz`, ni `uuid`, ni `enum`, ni `jsonb` | tous natifs | charte : `text` UUID, `text` ISO-8601, `integer` 0/1, `text` JSON |
| Clés étrangères | **ignorées par défaut** | toujours actives | `PRAGMA foreign_keys = ON` à chaque ouverture, avec un test qui le prouve |
| Casse et tri | `LIKE` insensible à la casse en ASCII seulement, pas de collation Unicode | `ILIKE`, collations | **aucune recherche via `LIKE` dans les repositories** : colonne `*_normalized` (minuscule, sans accents ni espaces), comparaison par égalité ou préfixe |
| Arabe | tri et recherche non gérés | idem sans extension | même parade, testée sur des chaînes arabes |
| Concurrence | un seul écrivain, `SQLITE_BUSY` | MVCC | mode WAL, pas de transaction longue, jobs d'alerte par lots |
| Dates | comparaison lexicographique de chaînes | idem si `text` | chaînes ISO **normalisées en UTC `Z` avec millisecondes fixes**, sinon le tri ment |
| **RLS** | **inexistant** | pilier de Supabase | **c'est le vrai coût, ci-dessous** |

### Le coût principal : le RLS n'est pas testable avant la Phase 12

En option A (Postgres local via `supabase start`), le cloisonnement serait garanti **par la base**
dès le premier jour, et une fuite serait impossible même en cas de bug applicatif. En option B,
pendant onze phases, **le cloisonnement repose entièrement sur le code applicatif**. C'est un
risque réel, concentré sur le critère n° 3 de l'auto-évaluation.

**Parade, à traiter comme une contrainte de conception et non comme un vœu :**

1. **`OrgScopedDb` — le typage rend l'erreur impossible, pas improbable.** Aucun repository ne
   reçoit un handle de base nu : il reçoit un `OrgScopedDb`, type opaque (branded) fabricable
   uniquement par `scopeToOrg(db, ctx)`. Toute fonction de repository a pour première signature
   `(scoped: OrgScopedDb, …)`. Un appel sans `orgId` **ne compile pas**. Ce n'est pas une
   convention, c'est le système de types.
2. **Test de fuite générique.** Un test unique itère sur **le registre des entités métier** et
   vérifie, pour chacune, que A ne peut ni lire, ni écrire, ni supprimer une ressource de B, et
   qu'il obtient un **404** (jamais 403). Ajouter une entité sans l'inscrire au registre fait
   échouer le test de couverture : le test grandit avec le schéma au lieu de se périmer.
3. **Interdiction du `db` nu hors de `src/db/`**, appliquée par une règle ESLint
   `no-restricted-imports` — un lint qui échoue, pas une revue de code.
4. **RLS écrit dès la Phase 1, appliqué en Phase 12.** Les policies Postgres sont rédigées et
   versionnées dans `src/db/policies/` **au moment où la table est créée**, pas onze phases plus
   tard quand plus personne ne se souvient des règles.

### Procédure de bascule vers l'option A, si tu changes d'avis

Le coût décroît vers zéro plus la bascule est précoce : Docker Desktop, puis `npx supabase init`,
`npx supabase start`, `DATABASE_URL` vers le Postgres local (port 54322), `DB_DIALECT=pg`,
`drizzle.config.ts` en `dialect: 'postgresql'`, `npx drizzle-kit generate && migrate`.
**Avant la fin de la Phase 3 : une demi-journée. Après la Phase 8 : une semaine.**
Recommandation honnête : si Docker tourne sur ta machine, l'option A est meilleure. Tu as tranché
pour B, je l'applique, et je te reposerai la question **une seule fois**, à la fin de la Phase 1.

### Écrire le schéma pour que les deux dialectes existent sans copier-coller

Un fichier par domaine dans `src/db/schema/`, décrivant les colonnes via un petit jeu de
constructeurs maison — `t.id()`, `t.orgId()`, `t.isoDate()`, `t.bool()`, `t.moneyMinor()`,
`t.json(schema)`, `t.enumText(values)` — résolus vers `sqlite-core` ou `pg-core` selon `DB_DIALECT`.
Ces constructeurs sont **la seule chose du projet qui connaît le dialecte**. Prix : environ 200
lignes de tuyauterie en Phase 1. Gain : la Phase 12 devient un changement de variable
d'environnement plus l'écriture du RLS, au lieu d'une réécriture de quarante fichiers.

---

## D-08 — Cartographie : MapLibre 6 et PMTiles auto-hébergé

**Décision.** `maplibre-gl@6.5.0`, fond de carte **Protomaps PMTiles**, extrait **Maroc**
uniquement, servi depuis notre propre stockage (Supabase Storage en prod, disque en dev).

**Pourquoi.**

- La politique d'usage d'OpenStreetMap est explicite : les **données** sont libres, **les serveurs
  de tuiles de l'OSMF ne le sont pas**. Taper `tile.openstreetmap.org` depuis un produit commercial
  est hors politique. Ce n'est pas une option.
- Protomaps produit un **fichier unique PMTiles** lu par le navigateur en requêtes HTTP Range : pas
  de serveur de tuiles, pas de base, pas de clé d'API. Un extrait Maroc pèse une fraction du
  planet, pour quelques euros par mois voire zéro.
- L'usage **commercial** du CDN Protomaps demande un sponsoring GitHub ; auto-héberger l'extrait
  évite la question. **Attribution « © OpenStreetMap » visible et obligatoire** sur chaque carte, y
  compris sur le site vitrine.

**Pièges v6, vérifiés, à traiter en Phase 7.** MapLibre 6 est **ESM uniquement**
(`maplibre-gl.mjs` ; les bundles UMD et CSP ne sont plus publiés), **exige WebGL2** (WebGL 1
supprimé) et cible **ES2022+**. L'import change : `import * as maplibregl from 'maplibre-gl'` ou
imports nommés, plus d'import par défaut. Conséquence produit : un appareil sans WebGL2 doit
recevoir un **repli lisible** — liste des véhicules avec dernière position et horodatage — et non
une carte grise.

---

## D-09 — GPS : Traccar plus mock

**Décision.** Interface `GpsProvider`, deux implémentations : `TraccarGpsProvider` et
`MockGpsProvider`.

Vérifié sur la documentation Traccar : REST (`GET /api/devices`,
`GET /api/positions?deviceId=…&from=…&to=…` en ISO-8601 UTC), rapports `ReportTrips`,
`ReportStops`, `ReportSummary`, et **la documentation recommande explicitement le WebSocket plutôt
que le polling** des positions.

**Conséquence.** `getLatestPositions` s'implémente en **abonnement WebSocket avec repli REST**, pas
en boucle de polling. Le mock rejoue une trace réelle Marrakech → Essaouira → Agadir : il rend les
Phases 1 à 6 indépendantes du matériel et permet de tester le calcul de kilométrage journalier qui
alimente les alertes de vidange.

---

## D-10 — Outillage : `corepack` pour pnpm, et `git init`

`pnpm` n'est pas installé sur cette machine (npm 11.6.1, Node 24.11.0), alors que le cahier des
charges mentionne `pnpm admin:create` et `pnpm demo:reset`. Décision : activer pnpm via
`corepack enable && corepack prepare pnpm@latest --activate`, et déclarer `packageManager` dans
`package.json` pour figer la version. Si tu préfères npm, les scripts sont identiques
(`npm run admin:create`) — dis-le et je change les commandes dans la documentation.

Le dossier n'est pas un dépôt git. **Je propose `git init` au début de la Phase 1** : sans
historique, l'auto-évaluation du §17 ne peut s'appuyer sur aucun diff, et une erreur de migration
n'est pas réversible.

---

## Écarts proposés au cahier des charges

Chaque écart est une proposition. Rien n'est appliqué sans ton accord.

### É-01 — Remonter **plans, quotas et `can()`** de la Phase 9 à la Phase 2

Le helper `can(org, 'gps.track')` et la vérification de quota côté serveur touchent **toutes** les
fonctions de création : véhicule, utilisateur, agence, contrat. Les livrer en Phase 9 revient à
écrire chaque `createX` deux fois, puis à re-tester le cloisonnement une seconde fois. Proposition :
livrer en Phase 2 les tables `plans`, `plan_features`, `usage_counters`, le helper `can()` et le
garde-fou de quota, **avec des plans en base et aucun paiement** ; garder en Phase 9 tout ce qui est
facturation réelle. Coût : environ un jour en Phase 2. Économie : environ trois jours en Phase 9 et
un risque de régression en moins.

### É-02 — `SELF_SERVE_SIGNUP` en **feature flag en base**, pas en variable d'environnement

En variable d'environnement, l'activer impose un redéploiement. En ligne de la table
`feature_flags` (déjà prévue au §9), tu bascules depuis `/admin` en trois secondes et tu reviens en
arrière aussi vite. Le drapeau reste lu côté serveur uniquement ; le site vitrine reçoit sa valeur
au rendu SSR, ce qui préserve l'exigence « le bouton change de libellé sans changement de code ».

### É-03 — Amendes : **figer** le rattachement au contrat au lieu de le recalculer

Le cahier des charges demande le « rattachement automatique au contrat actif à cet instant ».
Proposition : stocker le résultat (`contract_id`, `resolved_at`, `resolution_method`) plutôt que le
recalculer à chaque affichage. Un contrat corrigé après coup ne doit pas réattribuer silencieusement
une contravention à un autre client — ce serait faux, et juridiquement embarrassant. Et il faut
traiter le cas que le cahier des charges ne mentionne pas : **aucun contrat actif à cet instant**
(véhicule au parking, employé, convoyage) → statut `unassigned`, alerte au gérant, rattachement
manuel. C'est un cas fréquent, pas un cas limite.

### É-04 — Kilométrage projeté : **garde-fou de confiance**

La moyenne quotidienne réelle sur 90 jours est le bon calcul, mais une voiture achetée il y a dix
jours ou immobilisée un mois produit une projection absurde du type « vidange dans 1 400 jours ».
Proposition : moins de 14 jours de données ou moins de 200 km cumulés → repli sur la **médiane de la
catégorie dans la flotte**, avec la mention « estimation faible » affichée. Le seuil en kilomètres,
lui, reste toujours exact. Une projection fausse affichée avec aplomb détruit la confiance dans tout
le moteur d'alertes.

### É-05 — Démo : **deux organisations partagées**, pas une copie par visiteur

Le cahier des charges laisse le choix et demande d'en documenter le coût. Je recommande le partage.
Une copie par visiteur signifie, en SQLite, un fichier de base par session — ingérable — et en
Postgres un schéma ou un jeu de lignes par session avec sa purge : un sous-produit complet pour un
bénéfice de démonstration marginal. **Coût assumé et affiché** : deux visiteurs simultanés voient
les modifications l'un de l'autre. Atténuations : réinitialisation nocturne à 3 h, `demo:reset`, et
surtout **un bouton « réinitialiser cette démo » dans le bandeau, actionnable par le visiteur
lui-même**. C'est ce bouton qui résout l'essentiel du problème, pour une demi-journée de travail au
lieu d'une semaine.

### É-06 — Plaques marocaines : le format **a changé il y a trois semaines**

Vérifié le 2026-08-21 : un **format unifié national et international**, avec la lettre latine à côté
de la lettre arabe et la marque « MA » intégrée, a été publié au **Bulletin officiel n° 7531 du
3 août 2026** (décret 640.26), avec un format spécifique deux-roues au 1ᵉʳ janvier 2027. Le format
historique reste `NNNNN-X-CC` : série de 1 à 99 999, lettre arabe de série, code de préfecture de 1
à 99. S'y ajoutent les séries spéciales **WW** (importation, validité 45 jours), les plaques rouges
(État), bleues (Forces auxiliaires), jaunes (taxis et poids lourds), **CD** et **CC**.

**Conséquence** : le validateur doit accepter **les deux formats** et les séries spéciales, stocker
la forme canonique **et** la forme d'affichage, et ne jamais rejeter une plaque valide. Un loueur
dont l'application refuse d'enregistrer sa voiture désinstalle l'application. Cette information
n'est pas dans le cahier des charges parce qu'elle n'existait pas quand il a été écrit.

### É-07 — Une page vitrine minimale **dès la Phase 2**

Le cahier des charges place le site vitrine en Phase 11 et la raison donnée est bonne : il faut de
vraies captures. Nuance proposée : livrer dès la Phase 2 **une seule page** — accroche sobre et
formulaire de demande de démo relié à `leads` — pour que tu puisses commencer à parler à des
prospects pendant les neuf phases suivantes. Le site complet reste en Phase 11. Coût : une
demi-journée.

### É-08 — Impersonation : deux verrous de plus que demandé

En plus du bandeau, de la lecture seule par défaut, de l'expiration à 30 minutes et de la
journalisation : (1) **ressaisie du mot de passe** avant de démarrer une session d'impersonation,
même si la session admin est valide ; (2) **interdiction totale** d'entrer dans les écrans de
facturation du client et d'exporter ses données pendant une impersonation. Raison : c'est la
fonctionnalité qui transforme un incident de sécurité en fuite de données de tous tes clients à la
fois.

### É-09 — Le taux de TVA est une **donnée**, pas une constante

20 % aujourd'hui, stocké par ligne de facture avec date d'effet, jamais en `const VAT_RATE = 0.2`.
Un taux qui change en cours d'exercice ne doit pas réécrire les factures passées.

### É-10 — Paiement : livrer l'adaptateur **manuel** avant l'adaptateur Stripe

Détaillé en **D-05**. Le cahier des charges dit lui-même que tu crées les comptes à la main au
début : l'adaptateur manuel est donc le seul dont dépend la mise en service réelle. Stripe reste
livré et testé intégralement en mode test, comme demandé.

---

## Risques ouverts, suivis phase après phase

| # | Risque | Gravité | Suivi |
|---|---|---|---|
| R-1 | TanStack Start est en RC ; la 1.0 peut introduire des ruptures | moyenne | relire les notes de version à chaque phase ; versions **exactes**, jamais de `^` |
| R-2 | Le cloisonnement n'est garanti que par le code jusqu'en Phase 12 | **élevée** | `OrgScopedDb` typé, test de fuite générique, règle ESLint (D-07) |
| R-3 | Aucun encaissement réel possible sans décision juridique de ta part | **élevée** | `ManualPaymentProvider` livré en premier (D-05) |
| R-4 | Facturation électronique DGI : calendrier et format non figés publiquement | moyenne | modèle UBL-ready, `EInvoiceProvider` stub (D-06) |
| R-5 | TanStack Table v9 très récente, peu d'exemples | faible | `useLegacyTable` en repli (D-04) |
| R-6 | Qualité du rendu arabe RTL dans les PDF de contrat | moyenne | choisir le moteur PDF en Phase 5 **après** un test réel de shaping arabe, pas avant |
| R-7 | Traccar dépend d'un serveur à héberger et de boîtiers réels | moyenne | `MockGpsProvider` rend les Phases 1 à 6 indépendantes du matériel |

---

## Sources

Consultées le **2026-08-21**.

- Versions et métadonnées : registre npm, `https://registry.npmjs.org/<paquet>/latest` et
  `https://registry.npmjs.org/-/package/<paquet>/dist-tags`.
- [TanStack Start — Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [TanStack Start v1 Release Candidate](https://tanstack.com/blog/announcing-tanstack-start-v1)
- [Announcing TanStack Table V9](https://tanstack.com/blog/announcing-tanstack-table-v9) et le
  [guide de migration v8 vers v9](https://tanstack.com/table/latest/docs/framework/react/guide/migrating)
- [TypeScript 7.0 released — InfoQ](https://www.infoq.com/news/2026/08/typescript-7-released/) (GA
  du 8 juillet 2026, API programmatique non stable)
- [Better Auth — plugin organization](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/plugins/organization.mdx)
- Stripe au Maroc :
  [Dodo Payments — Stripe Supported Countries 2026, 46 pays](https://dodopayments.com/blogs/stripe-supported-countries-alternatives) ;
  [ChariBaaS — Stripe au Maroc en 2026](https://www.baas.ma/en/blog/stripe-maroc-2026-alternative)
  *(source éditée par un concurrent de Stripe, à lire comme telle)*
- Passerelles marocaines :
  [Comparatif des passerelles de paiement au Maroc 2026](https://www.baas.ma/fr/blog/comparatif-passerelle-paiement-maroc)
  *(même réserve)* ;
  [Digitoyou — CMI, Payzone, Stripe, PayPal](https://digitoyou.com/blog/paiement-en-ligne-maroc-cmi-stripe-2026/)
- Facturation électronique :
  [Sage — Facturation électronique au Maroc en 2026](https://www.sage.com/fr-ma/blog/facturation-electronique-maroc-2026/) ;
  [Upsilon Consulting — guide complet](https://www.upsilon-consulting.com/facturation-electronique-maroc-2026/)
- Plaques :
  [Vehicle registration plates of Morocco — Wikipedia](https://en.wikipedia.org/wiki/Vehicle_registration_plates_of_Morocco) ;
  [O'Voiture — format, codes régionaux et couleurs](https://ovoiture.ma/en/guides/plaque-immatriculation/)
  (mention du BO n° 7531 du 3 août 2026)
- [MapLibre GL JS v6 — WebGL2 obligatoire, ESM uniquement](https://geo.malagis.com/maplibre-gl-js-v6-mandatory-webgl-and-esm-only.html)
  et les [releases MapLibre](https://github.com/maplibre/maplibre-gl-js/releases)
- [Protomaps — Rethinking the Free Tier for Maps](https://protomaps.com/blog/free-tier-maps/) et
  [protomaps/basemaps](https://github.com/protomaps/basemaps)
- [Traccar — API Reference](https://www.traccar.org/api-reference/)
- [Supabase — Scheduling Edge Functions, pg_cron et pg_net](https://supabase.com/docs/guides/functions/schedule-functions)
