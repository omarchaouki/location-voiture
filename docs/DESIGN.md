# DESIGN — direction artistique

**Ce document décrivait une direction qui n'existe plus.**

Jusqu'au 27/08/2026, le produit portait une direction maison appelée « Registre » :
papier teinté, accent vert, structure entièrement portée par des filets d'un pixel,
cachets inclinés en capitales espacées, jeu d'icônes dessiné à la main, échelle
typographique resserrée à 14 px de corps. Elle est décrite dans l'historique Git, et
nulle part ailleurs.

Elle a été **retirée entièrement**, pas adaptée, à la demande explicite du propriétaire
du produit. Le produit utilise désormais **Tailwind CSS et shadcn/ui**, sans couche de
traduction : les jetons portent les noms de shadcn, les composants viennent de son
catalogue, et un exemple copié depuis sa documentation fonctionne sans réécriture.

## La palette — bleu et blanc

Le thème d'origine de shadcn est un gris **neutre**, chroma zéro : c'est une base de
démonstration, pas une identité. Le 27/08/2026, le produit prend la sienne.

- **Une seule teinte, 250–262 en OKLCH.** Elle porte l'action (`--primary`), l'anneau
  de focus (`--ring`) et la bordure de contrôle (`--input`) — et elle traverse aussi
  les gris : `--muted`, `--border`, `--foreground` gardent une trace de chroma bleu.
  Un accent coloré posé sur des gris neutres se lit comme un thème appliqué
  par-dessus ; la même teinte partout se lit comme une pièce.
- **Le fond n'est pas blanc, les cartes le sont.** `--background` est à 0,984 de
  clarté, `--card` à 1. Deux valeurs suffisent à détacher une carte du fond, sans
  ajouter une seule ombre.
- **La sévérité ne bouge pas.** Rouge, ambre et vert restent aux mêmes valeurs :
  ce sont des couleurs fonctionnelles, elles ne suivent pas la marque.
- **Thème sombre : bleu-nuit, pas gris.** Le bleu s'éclaircit (0,68) et prend une
  encre sombre — un bleu moyen sur fond nuit ne porte plus l'action principale.

## Où lire la direction, maintenant

Il n'y a plus de document qui la décrive, et c'est volontaire : un document de design
qui double le code diverge du code. La source unique est :

- `src/styles/tokens.css` — les jetons, leurs valeurs dans les deux thèmes, et la
  raison écrite de chaque écart au thème d'origine de shadcn ;
- `src/styles/app.css` — leur exposition à Tailwind, l'échelle typographique, et les
  utilitaires qui n'existent pas dans Tailwind (RTL, chiffres tabulaires, tiroir) ;
- `src/ui/shadcn/` — les composants, chacun commenté là où il s'écarte du catalogue.

## Ce qui n'est PAS du design, et n'a pas bougé

Quatre contraintes ont survécu à la refonte parce qu'elles relèvent du produit et non
de son apparence. Elles sont vérifiées par `pnpm check:hardcoded` et `pnpm check:tokens` :

1. **Propriétés logiques partout.** `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`, jamais
   `ml-`/`pr-`/`left-`. shadcn écrit en propriétés physiques ; chaque composant repris
   a été traduit. Sans cela l'arabe s'affiche à l'envers, et le défaut est invisible
   depuis une interface française.
2. **Cibles de 44 px** (`--tap-target`) sur tout ce qui se touche : boutons, lignes
   cliquables, onglets, navigation. shadcn dessine à 36 px, une valeur de bureau ;
   l'écran principal du produit est un téléphone posé sur un comptoir de location.

   Les **champs** font exception, depuis le 27/08/2026 : ils lisent `--control-h`,
   qui vaut 40 px à la souris et remonte à 44 px sur pointeur grossier
   (`@media (pointer: coarse)`). Un formulaire de véhicule aligne quatorze champs — à
   44 px chacun il fait deux écrans, et la saisie devient un défilement. Le doigt les
   trouve quand même : c'est le `<label>` autour qui porte la cible, et il est plus
   haut que son champ. Les boutons lisent le MÊME jeton, pour qu'un bouton d'envoi et
   le champ d'à côté fassent la même hauteur au pixel.
3. **Chiffres tabulaires** (`.numeric`) sur les montants, les compteurs et les plaques.
   Une colonne de dirhams qui danse d'une ligne à l'autre se lit faux.
4. **Isolation bidi** sur les plaques marocaines : elles mélangent chiffres latins et
   lettre arabe, et sans isolation l'ordre des blocs s'inverse à la lecture.

## Une seule définition de champ

`src/ui/shadcn/field.tsx` porte la constante `CONTROL`, et c'est **la seule** classe de
contrôle du produit. `src/ui/forms/fields.tsx` l'habille (nom, étiquette, options
traduites), le combobox l'importe par `controlClass()`, et les écrans n'écrivent plus
rien.

Il y en avait **quatre** avant le 27/08/2026 — celle-ci, une copie dans
`forms/fields.tsx`, une troisième recopiée à la main dans le formulaire véhicule, une
quatrième dans le combobox — et elles avaient déjà divergé : arrondi `sm` ici, angles
vifs là, une ombre d'un seul côté. C'est un écart qu'on ne voit pas écran par écran, et
qui saute aux yeux quand on les met côte à côte.

## Contrastes

`pnpm check:tokens` mesure les paires réelles dans les deux thèmes et échoue sous le
seuil. Il a attrapé, à l'adoption, **deux valeurs par défaut de shadcn qui ne tiennent
pas WCAG en thème clair** : `--muted-foreground` (4,34:1 sur surface sourde, seuil 4,5)
et `--input` (2,59:1 sur le fond, seuil 3 pour le pourtour d'un contrôle). Les deux ont
été foncées. C'est exactement ce à quoi sert le contrôle : un thème réputé sérieux
n'est pas dispensé d'être mesuré.
