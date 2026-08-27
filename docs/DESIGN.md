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
2. **Cibles de 44 px.** shadcn dessine à 36 px, une valeur de bureau. L'écran
   principal du produit est un téléphone posé sur un comptoir de location.
3. **Chiffres tabulaires** (`.numeric`) sur les montants, les compteurs et les plaques.
   Une colonne de dirhams qui danse d'une ligne à l'autre se lit faux.
4. **Isolation bidi** sur les plaques marocaines : elles mélangent chiffres latins et
   lettre arabe, et sans isolation l'ordre des blocs s'inverse à la lecture.

## Contrastes

`pnpm check:tokens` mesure les paires réelles dans les deux thèmes et échoue sous le
seuil. Il a attrapé, à l'adoption, **deux valeurs par défaut de shadcn qui ne tiennent
pas WCAG en thème clair** : `--muted-foreground` (4,34:1 sur surface sourde, seuil 4,5)
et `--input` (2,59:1 sur le fond, seuil 3 pour le pourtour d'un contrôle). Les deux ont
été foncées. C'est exactement ce à quoi sert le contrôle : un thème réputé sérieux
n'est pas dispensé d'être mesuré.
