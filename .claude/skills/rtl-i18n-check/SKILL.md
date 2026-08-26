---
name: rtl-i18n-check
description: Utiliser quand tu ajoutes ou modifies du texte, un formatage de nombre ou de date, une mise en page, ou avant de déclarer un écran fini. Liste de vérification arabe et RTL, y compris les chiffres latins et l'isolation bidi des plaques.
---

# Arabe et RTL — liste de vérification

## Textes

- Aucune chaîne en dur dans un composant. Tout passe par `t('clé')`.
- Les **trois** langues sont remplies en même temps : `src/i18n/locales/{fr,ar,en}/common.json`.
  `tests/unit/i18n-parity.test.ts` échoue si une clé manque ou si une valeur est vide.
- L'arabe a **six** formes de pluriel (`_zero _one _two _few _many _other`), le français deux.
  N'aligne pas les suffixes, remplis ceux dont la langue a besoin.
- Vocabulaire métier de référence : `docs/DOMAIN.md` §2. Le registre employé par les loueurs
  marocains mélange arabe standard et darija ; se tromper de registre fait « traduction automatique »
  immédiatement. **Les traductions arabes du projet attendent une relecture humaine** (porte de
  relecture avant la Phase 3, `docs/AUDIT.md`).
- Les emails et les PDF sont traduits aussi, pas seulement les écrans.

## Chiffres, dates, argent

- **Jamais d'`Intl` appelé dans un composant.** Tout passe par `src/i18n/format.ts`. ESLint le refuse.
- **Jamais la locale `ar` nue.** `ar` utilise `,` pour les milliers et `.` pour les décimales ;
  `ar-MA` fait l'inverse (comme `fr-MA`). Un montant de 1 250,00 MAD s'afficherait « 1,250.00 » —
  un facteur 1000 à l'œil d'un lecteur francophone. `intlTag('ar')` renvoie `ar-MA-u-nu-latn`.
- Chiffres **latins** partout, même en arabe : c'est l'usage marocain. Le `-u-nu-latn` est une
  ceinture pour les ICU anciennes ; sur ICU moderne `ar-MA` résout déjà `latn`.
- Dates grégoriennes. Heures locales via `businessParts()` / `businessCivilDate()` :
  **`Africa/Casablanca` repasse à UTC+0 pendant le Ramadan**, jamais d'offset fixe.
- Argent : entrée en **centimes entiers**, sortie par `formatMoney()`.

## Mise en page

- Propriétés **logiques** uniquement : `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`,
  `text-end`, `border-s`, `border-e`, `inset-inline-*`.
  Interdits : `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`.
  `pnpm check:hardcoded` les refuse.
- `transform-origin` et `translateX` n'ont pas d'équivalent logique : utiliser les utilitaires
  `.origin-inline-start` et `.rail-dot` de `app.css`, qui gèrent les deux sens.
- Icônes **directionnelles** (chevron, flèche, retour) : passer `directional`.
  Icônes **d'objet** (voiture, clé, bidon d'huile) : jamais miroitées.
- **Plaques et références toujours dans `<Plate>` ou un `<bdi>`.** Une plaque marocaine mélange
  chiffres latins et lettre arabe : sans isolation bidi, l'ordre des trois blocs s'inverse à la
  lecture — y compris en interface française.

## Vérification avant de dire que c'est fini

```
pnpm check:hardcoded && pnpm test i18n-parity
```

Puis, dans le navigateur, sur `/ar/...` :

1. `document.documentElement.dir === 'rtl'` et la police arabe est bien appliquée.
2. Aucun débordement horizontal à 360 px (`scrollWidth <= innerWidth`).
3. Aucun mot français ou anglais résiduel dans la page.
4. Les montants et les kilométrages s'affichent avec `.` pour les milliers et `,` pour les décimales.
5. Les plaques se lisent dans le bon ordre.
