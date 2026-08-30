# AUDIT.md — Auto-évaluations de fin de phase

Protocole du §17 du cahier des charges. Une entrée datée par phase, une note sur 5 par critère,
chaque note justifiée en une phrase et appuyée par une preuve. Toute note sous 4 déclenche une
correction immédiate puis une nouvelle notation, trois itérations maximum.

**Règle que je m'applique ici : un critère qui ne peut pas être prouvé n'est pas noté.** Mettre 5
à « cloisonnement multi-tenant » alors qu'aucun test n'existe serait une note inventée, ce qui est
exactement ce que le critère n° 12 interdit.

---

## Phase 0 — Recherche et cadrage · 2026-08-21

**Livrables** : `docs/DECISIONS.md`, `docs/DOMAIN.md`, `docs/DESIGN.md`, cette entrée.
**Code applicatif écrit : aucun**, conformément au §18.

### Notation

| # | Critère | Note | Justification et preuve |
|---|---|---|---|
| 1 | Exactitude métier | **4 / 5** | Le modèle couvre les objets réels du métier — vignette, visite technique, carte grise, caution, état des lieux contradictoire, amende rattachée au conducteur, identifiants ICE/IF/RC — et le carburant est stocké en huitièmes parce que c'est ce que montre la jauge. Preuve : `docs/DOMAIN.md` §3 et §9. **Pourquoi pas 5** : rien n'a été relu par un loueur marocain en exercice. Trois points restent des hypothèses de ma part — la matrice des rôles, la liste de contrôle de l'état des lieux, et la catégorisation des dépenses. |
| 2 | Exactitude technique | **5 / 5** | Aucune version ni aucune API n'est écrite de mémoire. Les 23 versions du tableau viennent d'une lecture directe de `registry.npmjs.org` le 2026-08-21 ; la signature `createServerFn().validator().handler()` et l'origine de `redirect()` / `notFound()` viennent de la documentation TanStack relue ce jour. Deux pièges concrets ont été trouvés par cette vérification et auraient cassé la Phase 1 : `typescript-eslint` interdit TypeScript 7, et MapLibre 6 est ESM seul et exige WebGL2. Preuve : `docs/DECISIONS.md` §0, D-01, D-08. |
| 3 | Cloisonnement multi-tenant | **non noté** | Aucun code, donc aucune preuve possible. La conception est arrêtée (`OrgScopedDb` typé, test de fuite générique piloté par un registre d'entités, règle ESLint, 404 et non 403), mais une conception n'est pas une preuve. Première notation possible : Phase 2. Suivi en tant que risque **R-2**, classé élevé. |
| 4 | Portabilité vers Postgres | **4 / 5** | La charte du §3 est traduite en règles exécutables : constructeurs de colonnes uniques, dates en trois types distincts, argent en entier mineur, normalisation de recherche pour contourner l'absence de collation SQLite. Preuve : `docs/DOMAIN.md` §1, `docs/DECISIONS.md` D-07. **Pourquoi pas 5** : le point le plus coûteux — le RLS — reste non testable jusqu'en Phase 12, et c'est une conséquence directe de l'option B que tu as choisie. Le coût est chiffré et la procédure de bascule vers l'option A est écrite. |
| 5 | Fiabilité du moteur d'alertes | **non noté** | L'idempotence est conçue comme une contrainte de base (index unique sur `org_id, entity_type, entity_id, alert_type, threshold_key`) et non comme une précaution applicative, et le garde-fou de confiance sur le kilométrage projeté est spécifié (É-04). Rien n'est exécutable. Première notation : Phase 4. |
| 6 | Facturation | **non noté** | L'idempotence des webhooks repose sur l'unicité de `payment_events.provider_event_id` et la réconciliation par `last_event_at` pour les arrivées en désordre. Non exécutable. Première notation : Phase 9. |
| 7 | Qualité de l'arabe et du RTL | **non noté** | Aucune chaîne, aucun composant. Trois décisions engageantes sont prises : superfamille unique IBM Plex pour les trois écritures, asymétrie assumée au niveau affichage, isolation bidi obligatoire du composant plaque. Première notation : Phase 1. |
| 8 | Singularité du design | **4 / 5** | Notée **2 / 5 au premier jet**, puis corrigée. Le premier plan — graphite, crème, orange, condensée, filets partout, rayon zéro — était la réponse par défaut, et je l'aurais produit pour un logiciel de maintenance industrielle allemand. Sept axes ont été changés et trois éléments supprimés. Ce qui reste est ancré dans le sujet : le rouge du triangle de présignalisation, l'absence totale de vert, la plaque comme nom du véhicule, l'axe « aujourd'hui » aligné à travers tout le tableau. Preuve : `docs/DESIGN.md` §5, tableau v1 → v2. **Pourquoi pas 5** : aucun pixel n'existe. Un plan singulier peut être exécuté platement. |
| 9 | États de chargement | **non noté** | Spécifiés (150 ms d'apparition, 400 ms de maintien, squelettes iso-géométrie, pas de squelette en rafraîchissement d'arrière-plan). Non observables. Première notation : Phase 1. |
| 10 | Accessibilité et mobile | **non noté** | Spécifiés (360 px, 44 px, focus propre, AA mesuré, aucune information portée par la seule couleur). Non observables. Première notation : Phase 1. |
| 11 | Performance | **non noté** | La liste des index de première migration et la volumétrie de référence sont écrites, ce qui donne quelque chose contre quoi mesurer. Rien à mesurer aujourd'hui. Première notation : Phase 3. |
| 12 | Honnêteté | **4 / 5** | Les stubs sont nommés (`NoopEInvoiceProvider`), les sources sont datées et liées, et les sources publiées par des concurrents de Stripe sont signalées comme telles à deux reprises. Preuve : `docs/DECISIONS.md` D-05 et §Sources. **Pourquoi pas 5** : mon information sur les passerelles marocaines repose malgré tout, en partie, sur des documents commerciaux. Tant que je n'aurai pas testé un bac à sable réel, ce que j'écris sur CMI, Payzone et Chari Pay indique une direction et non un fait établi. |

### Boucle de correction appliquée

Un seul critère est passé sous 4 : le n° 8. Une itération a suffi.

- **Tour 1 — note 2.** Direction *Atelier* : crème, orange terracotta rebaptisé « orange
  sécurité », typographie condensée, filets fins, rayon zéro. Verdict : trois des trois axes
  auraient été identiques pour n'importe quel brief d'outil technique, et le crème plus terracotta
  est nommément interdit par le §13.
- **Tour 2 — note 4.** Palette redérivée d'objets réels du métier, vert supprimé du système,
  élévation par papier contre feuille au lieu de filets, affichage en grotesque élargie plutôt que
  condensée, signature portée à trois échelles, plaque promue au rang de nom du véhicule.
  Consigné en `docs/DESIGN.md` §5.

Aucun critère ne reste sous 4 après itération. Aucune option tranchée à te soumettre à ce titre.

### Stubs et dettes déclarés à ce stade

| Élément | État | Levée prévue |
|---|---|---|
| `EInvoiceProvider` | interface seule, `NoopEInvoiceProvider` | quand la plateforme DGI sera accessible et documentée |
| `LocalGatewayPaymentProvider` | interface plus documentation | après signature d'un contrat marchand CMI ou Payzone |
| Policies RLS | rédigées avec chaque table, **inactives** | Phase 12 |
| Fuseau `Africa/Casablanca` et bascule Ramadan | signalé dans `DOMAIN.md` §1.3, **à revérifier** | Phase 4, à l'écriture du planificateur |
| Matrice des rôles, liste de contrôle de l'état des lieux | hypothèses de ma part | à faire valider par un loueur en exercice |

---

### Ce qui marche vraiment

- La vérification a payé immédiatement : deux décisions qui auraient cassé la Phase 1 ont été
  attrapées avant d'écrire une ligne (TypeScript 7 incompatible avec le lint typé, MapLibre 6 en
  ESM strict avec WebGL2 obligatoire), plus deux informations que le cahier des charges ne pouvait
  pas contenir (facturation électronique DGI, nouveau format de plaque du 3 août 2026).
- La prémisse du cahier des charges sur Stripe est confirmée, pas supposée : 46 pays, le Maroc n'en
  fait pas partie, rien n'a changé.
- La contrainte de cloisonnement est traduite en contrainte de **compilation** plutôt qu'en
  discipline d'équipe. C'est la seule forme qui tient sur onze phases.
- L'autocritique de design a réellement changé le résultat. Elle n'a pas servi à justifier le
  premier jet.

### Ce qui est fragile

- **Le cloisonnement n'est garanti par rien d'autre que le code jusqu'en Phase 12.** C'est la
  conséquence assumée de l'option B. C'est le risque numéro un du projet, devant tout le reste.
- **Aucun encaissement n'est possible aujourd'hui** sans une décision juridique qui n'est pas de
  mon ressort. Le code est prêt pour les trois scénarios, mais le code ne remplace pas la décision.
- **Le modèle de domaine n'a été relu par personne du métier.** Il est cohérent ; cohérent n'est pas
  juste. Une demi-heure avec un gérant d'agence vaudrait plus que ma journée de recherche.
- **TanStack Start est en Release Candidate.** Feature-complete selon l'éditeur, mais 1.0 n'est pas
  sortie. Versions épinglées à l'exact, aucun `^`.
- **La direction artistique repose sur une restriction.** Une palette qui refuse le vert et les
  ombres ne pardonne aucune approximation d'exécution.

### Ce que je ferais différemment

- **Je passerais en option A.** Postgres local dès le premier jour rendrait le RLS testable
  immédiatement et supprimerait le risque R-2 au lieu de le gérer pendant onze phases. Tu as
  tranché pour B, je l'applique — je te poserai la question une seule fois, à la fin de la Phase 1,
  quand la bascule coûtera encore une demi-journée.
- **Je remonterais les quotas en Phase 2** (É-01) : les livrer en Phase 9 impose d'écrire chaque
  fonction de création deux fois.
- **J'aurais commencé par appeler un loueur, pas par lire des documentations.** Le modèle de
  domaine aurait été meilleur, et deux jours de Phase 5 seraient déjà économisés.


---

## Phase « ouverture commerciale » — 29/08/2026

Douze demandes livrées en un lot, parce qu'elles racontent une seule histoire : rendre le produit
achetable sans passer par un appel téléphonique.

### Ce qui a été livré

| # | Demande | État |
|---|---|---|
| 1 | Processus de retour du véhicule | **existait déjà** (`settleReturn`, `ReturnPanel`) — vérifié, non réécrit |
| 2 | Inscription multi-étapes avec accès instantané | livré (`/$lang/inscription`, 12 tests) |
| 3 | Lien d'inscription sur la page de connexion | livré |
| 4 | Grille tarifaire compétitive | livrée (migration `0002`, relevé concurrent daté) |
| 5 | Téléversement du logo d'agence | livré (couche `storage`, 19 tests) |
| 6 | Contenu du contrat modifiable | livré (blocs + variables, aperçu, impression) |
| 7 | Image optionnelle par voiture | livré (vignette, liste + fiche) |
| 8 | Vidange par voiture | livré côté écran ; le domaine existait depuis la Phase 3 |
| 9 | Espagnol sur tout le produit | livré (995 clés, parité vérifiée) |
| 10 | Deux mois gratuits par offre | livré (`TRIAL_DAYS = 60`) |
| 11 | Comptes créés avec mot de passe, selon l'offre | livré (`/$lang/app/equipe`, quota appliqué) |
| 12 | Tableau payé / impayé et relance des débiteurs | livré (3 requêtes fixes, 8 tests) |

633 → 633 + 49 tests, tous verts. `typecheck`, `lint`, `check:tokens`, `check:hardcoded` et
`check:budget` passent.

### Ce que je n'ai pas fait, et pourquoi

- **La migration n'a pas été appliquée à ta base Supabase.** `drizzle/0001` (colonne vignette,
  table des modèles de contrat) et `drizzle/0002` (nouvelle grille) attendent un `pnpm db:migrate`
  que tu déclenches. Écrire dans ta base de production sans le demander n'est pas à moi de le
  décider — et tant que `0002` n'a pas tourné, la page tarifaire affiche encore l'ANCIENNE grille,
  puisqu'elle lit les prix en base.
- **Aucune inscription réelle n'a été jouée sur ta base.** Le parcours est prouvé par
  `tests/unit/signup.test.ts` contre un vrai Postgres en mémoire, pas contre Supabase : un essai à
  la main y aurait laissé une organisation fantôme.
- **Le découpage des dictionnaires par langue a été tenté puis retiré.** Il faisait tomber le paquet
  d'entrée de 203,7 à 144,5 ko — meilleur qu'avant l'espagnol — mais l'hydratation repartait sur des
  clés brutes. Voir R-8 : c'est un travail d'amorçage de l'application, pas d'internationalisation.

### Ce qui reste ouvert, et que je surveillerais en premier

- **Le budget d'entrée est relevé à 210 ko.** C'est une dette explicite, pas une nouvelle norme.
  Une cinquième langue coûterait encore 16 ko à tout le monde : c'est le moment où R-8 devra être
  traité plutôt que le chiffre relevé.
- **Les clauses du contrat par défaut ne sont pas un avis juridique**, et l'écran le dit. Elles
  reprennent l'ossature d'un contrat de courte durée au Maroc pour qu'une agence ne parte pas d'une
  page blanche. Une relecture par un avocat vaudrait plus que ma journée de rédaction — c'est le
  même constat que pour le modèle de domaine.
- **Le mot de passe initial d'un agent est connu du gérant.** C'est le modèle de tous les logiciels
  de comptoir, et c'est un compromis assumé ; l'invitation par courriel reste disponible pour qui
  veut l'éviter.
- **Le stockage local ne survit pas à deux machines.** `STORAGE_PROVIDER=supabase` est écrit et
  éprouvé côté interface, mais jamais exécuté contre un vrai seau : il faudra créer le seau privé
  `flotta` et faire un aller-retour réel avant de basculer.
