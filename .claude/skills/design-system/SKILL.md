---
name: design-system
description: Utiliser quand tu écris ou modifies une interface de ce projet — page, composant, style, couleur, icône, mise en page. Donne les jetons, la direction « Registre », les interdits esthétiques et les règles d'usage du jeu d'icônes maison.
---

# Design system — direction « Registre »

Source complète : `docs/DESIGN.md`. Ceci en est l'extrait opérationnel.

## La direction en une phrase

Le produit ressemble au document que l'entreprise tient déjà : un registre administratif marocain
bilingue — filets fins, marge numérotée, cachets — recomposé en typographie contemporaine.

## Les cinq gestes

1. **Filets d'abord.** `box-shadow` et `shadow-*` sont interdits, à deux exceptions nommées :
   `--overlay-shadow` dans `src/ui/overlay/` (menu, dialogue, infobulle) et `shadow-card`, un
   liseré porté d'un pixel, sur les cartes. Aucune ombre écrite à la main.
   `pnpm check:hardcoded` le vérifie.
2. **Marge de registre.** Une colonne en `inline-start`, séparée par un filet, porte l'identifiant :
   plaque, référence de contrat, numéro de facture. Classe `.ledger-margin`.
3. **Libellés appariés.** Un champ peut porter son libellé dans la seconde langue, en `--muted`,
   taille `2xs`.
4. **Cachet, pas pastille.** États terminaux via `<Stamp>` : contour, capitales espacées, légère
   rotation. Jamais de fond plein arrondi.
5. **Numérotation visible.** Toute référence en `.numeric` (mono, chiffres tabulaires).

## Jetons — n'écris jamais une couleur littérale

| Rôle | Jeton Tailwind |
|---|---|
| Fond de page | `bg-paper` |
| Zone de saisie / tableau | `bg-surface`, `bg-surface-sunken` |
| Texte | `text-ink`, `text-muted` |
| Filets | `border-rule` (séparation), `border-rule-strong` (bordure de contrôle) |
| **Accent unique** | `text-stamp`, `bg-stamp`, `text-stamp-contrast` |
| Sévérité | `text-calm`, `text-warn`, `text-danger` (+ `*-wash` en fond) |
| Élévation | `shadow-card` — le seul nom d'ombre autorisé sur du contenu |

**Règle de l'accent, non négociable :** `--stamp` marque *aujourd'hui* et *la prochaine action*.
Rien d'autre. Pas d'en-tête coloré, pas de fond, pas de graphique.

**La couleur ne porte jamais l'information seule.** Chaque sévérité porte aussi une forme : filet
épaissi, cachet, position sur la frise.

Échelle typographique : `text-2xs 11` · `xs 12` · `sm 13` · `base 15` · `md 17` · `lg 20` ·
`xl 25` · `2xl 32` · `3xl 40`. **Une seule voix** : `font-display` et `font-sans` sont le même
Plex Sans, la hiérarchie passe par la graisse et la taille ; `font-mono` pour les chiffres.
Espacement base 4 px. Rayons : `rounded-sm 4` · `rounded-md 6` · `rounded-lg 10` — jamais au-delà,
une carte de données n'est pas une bulle de discussion.

**Palette : gris NEUTRES + un vert.** Tous les gris sont à chroma 0 — fond, encre, filets. Le vert
`--stamp` ne sert qu'à l'action et à l'icône de la rubrique courante ; teinter les gris donne à
l'interface l'aspect d'un thème posé par-dessus. Valeurs exactes dans `src/styles/tokens.css`.

**Police unique : Inter.** `font-display`, `font-sans` et `font-mono` pointent tous dessus ; les
chiffres tabulaires viennent de `.numeric` (`font-variant-numeric`), pas d'une seconde police.

## Coquille des espaces connectés

`<Shell>` (`src/ui/nav/shell.tsx`) sert `/app` ET `/admin` : rail vertical de 240 px à partir de
1024 px, en dessous un en-tête compact et la bande défilante. `<Card>`, `<CardHeader>`,
`<CardBody>`, `<StatGroup>` et `<PageHeader>` (`src/ui/primitives/card.tsx`) sont les briques des
tableaux de bord — n'en redessine pas d'autres.

Toute liste de données passe par `<DataTable>` (`src/ui/primitives/table.tsx`) : un vrai `<table>`
au-dessus de 768 px, une fiche empilée en dessous. Une `<ul>` de rangées `flex` ne nomme pas ses
colonnes, ne les aligne pas, et n'annonce rien à un lecteur d'écran.

Tout choix parmi plus de cinq options passe par `<Combobox>` / `<Picker>`
(`src/ui/forms/combobox.tsx`) : saisie assistée, accents ignorés, clavier complet. Un `<select>`
natif au-delà de cinq options est une roulette qu'on fait défiler au pouce.

## Icônes

Jeu maison dans `src/ui/icons/`, grille 24, trait 1,75, `currentColor`, sans remplissage.
**Aucune bibliothèque tierce** (`lucide-react`, `@heroicons/react`, `react-icons` sont refusées par
ESLint). Une icône manquante se dessine, elle ne s'installe pas.

Une icône ajoutée doit être : (a) exportée depuis `src/ui/icons/index.ts`, (b) inscrite dans
`src/ui/icons/registry.ts` — sinon `tests/unit/icon-registry.test.ts` échoue. **Ne déduis jamais la
liste par `Object.entries()`** : l'ordre diffère entre les paquets serveur et client et provoque une
erreur d'hydratation (constatée pour de vrai en Phase 1).

Icônes **directionnelles** (chevrons, flèches) : passer `directional`, elles seront miroitées en RTL.
Icônes **d'objet** (voiture, clé, bidon) : jamais miroitées.

## Chargement, vide, erreur

- Barre supérieure : `<TopProgress />`, 150 ms avant apparition, 400 ms minimum à l'écran.
- Squelettes : `src/ui/skeletons/` — ils reproduisent la GÉOMÉTRIE EXACTE (mêmes hauteurs de ligne,
  mêmes filets). Jamais de squelette pour un rafraîchissement en arrière-plan.
- États vides : une phrase qui dit ce qui manque + le bouton qui le crée. Pas d'illustration.
- États d'erreur : ce qui s'est passé, quoi faire, la référence à donner. Pas de « Oups ! ».

## Avant de dire qu'un écran est fini

1. `pnpm check:tokens` (contrastes) et `pnpm check:hardcoded` passent.
2. L'écran a été **regardé** en clair et en sombre, en `fr` et en `ar`, à 360 px et à 1440 px.
3. Un lien reste un `<a>` : jamais de `<button>` imbriqué dans une ancre (`buttonClasses()` existe
   pour ça).
