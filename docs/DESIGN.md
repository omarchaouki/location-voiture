# DESIGN.md — Direction artistique

Version **0.1 — Phase 0**. Date : **2026-08-21**. Aucun composant écrit à ce stade.
Ce document est contractuel : la Phase 1 implémente ces jetons, pas d'autres.

---

## 0. Le sujet, avant la décoration

Trois surfaces, un seul système de jetons, trois densités.

| Surface | Utilisateur | Contexte réel | Densité |
|---|---|---|---|
| Site vitrine | prospect | téléphone, en déplacement, 40 secondes d'attention | aérée, éditoriale |
| Application | gérant, agent | bureau d'agence, écran 1366×768 poussiéreux, ou téléphone au comptoir en pleine remise de clés | dense, opérationnelle |
| `/admin` | moi | portable, une fois par jour | sobre, fonctionnelle |

Le produit ne vend pas « une gestion de flotte ». Il vend **le fait de voir arriver l'échéance
avant qu'elle ne coûte de l'argent**. Une assurance oubliée sur un véhicule en location, c'est un
sinistre non couvert. C'est cette phrase, et pas une autre, qui doit gouverner chaque décision
visuelle.

---

## 1. Palette — 6 couleurs nommées, en OKLCH

Le raisonnement d'abord, les valeurs ensuite.

**Position de départ, assumée et discutable : l'interface est achromatique tant que rien ne
réclame d'action.** La couleur d'accent n'est pas une couleur de marque posée sur des boutons,
c'est **la couleur de l'urgence**, et c'est la même. Conséquence directe : une flotte bien tenue
s'affiche en noir et blanc ; une flotte en difficulté se couvre de rouge. Le compte de
démonstration « Sahara Rent Agadir » du §8 du cahier des charges ne devient donc pas alarmant par
hasard : la direction artistique est construite pour que la démonstration se démontre toute seule.

**Corollaire décidé : il n'y a pas de vert.** Aucune couleur « succès », aucune pastille verte
« tout va bien ». Le bon état s'exprime par l'absence de couleur. C'est le risque esthétique de ce
projet, et je l'assume : il retire au produit le vocabulaire rassurant habituel, mais il rend le
signal d'alerte incomparablement plus fort. Un tableau de bord où tout clignote en vert et en rouge
n'apprend rien ; un tableau de bord gris où **une seule** ligne est rouge se lit en une seconde,
ce qui est très exactement l'objectif des dix secondes du §2 du cahier des charges.

| Jeton | OKLCH | Rôle |
|---|---|---|
| `--ink` | `oklch(0.245 0.022 250)` | encre. Texte principal, boutons primaires, en-têtes de tableau. Un noir **bleuté**, celui du stylo administratif, jamais un `#000` ni un gris neutre. |
| `--paper` | `oklch(0.966 0.005 170)` | le plan de travail. Fond général, très légèrement froid et verdâtre — le papier des formulaires, pas le crème d'un carnet. |
| `--sheet` | `oklch(1 0 0)` | la feuille posée dessus. Blanc pur, réservé aux surfaces qui portent du contenu. **C'est le seul mécanisme d'élévation du produit : il n'y a pas d'ombres.** |
| `--rule` | `oklch(0.875 0.008 230)` | filets et séparateurs, **à l'intérieur** d'une feuille uniquement. |
| `--muted` | `oklch(0.545 0.016 245)` | texte secondaire, libellés, unités. Contraste 4,6:1 sur `--sheet`, vérifié. |
| `--signal` | `oklch(0.555 0.215 28)` | **la seule couleur du produit.** Échéance due ou dépassée, marque, ligne « aujourd'hui ». |

**Règle de dérivation plutôt que septième couleur.** L'état « approche » (`--ember`) n'est pas une
couleur de plus, c'est `--signal` transformé : `L + 0.165`, `C − 0.085`, `h + 12`, soit
`oklch(0.72 0.13 40)`. Le dégradé d'urgence est donc **une seule teinte** qui gagne en densité en
approchant de l'échéance. Pas de vert vers orange vers rouge : le rouge arrive, tout simplement.

**Pourquoi ce rouge-là.** Référence explicite au triangle de présignalisation, objet
réglementairement présent dans chaque voiture de location et coché dans la liste de l'état des
lieux. Ce n'est pas « le rouge d'erreur de Tailwind », c'est un objet du métier.

### Thème sombre — une inversion, pas une négation

Le thème sombre n'inverse pas les valeurs : il change de lieu. Le clair est le bureau de l'agence,
le sombre est **le parking la nuit**.

| Jeton | OKLCH sombre |
|---|---|
| `--paper` | `oklch(0.185 0.014 250)` |
| `--sheet` | `oklch(0.235 0.016 250)` |
| `--ink` | `oklch(0.945 0.006 220)` |
| `--rule` | `oklch(0.33 0.014 245)` |
| `--muted` | `oklch(0.68 0.014 240)` |
| `--signal` | `oklch(0.66 0.185 30)` — remonté en clarté, redescendu en chroma : un rouge saturé sur fond sombre vibre et fatigue |

Les deux thèmes sont soignés, aucun n'est un sous-produit de l'autre.

---

## 2. Typographie

Trois rôles, trois familles, une contrainte qui commande tout : **le français, l'anglais et l'arabe
doivent avoir la même autorité.** Une interface arabe rendue avec une police de repli est un
produit de seconde zone, et le §12 du cahier des charges ne le tolère pas.

| Rôle | Famille | Emploi |
|---|---|---|
| **Affichage** | `Archivo` variable, axe `wdth` **112 à 125**, poids 700, capitales, interlettrage −1 % | uniquement : accroche du site vitrine, sur-titres de section, `h1` d'écran, grands nombres du tableau de bord. Une grotesque **élargie**, mécanique, qui évoque une étiquette de panneau de commande. |
| **Texte** | `IBM Plex Sans` (fr, en) et `IBM Plex Sans Arabic` (ar) | tout le reste. Même superfamille, hauteurs d'x et graisses accordées par construction — c'est ce qui rend la bascule RTL invisible. Licence OFL, auto-hébergeable. |
| **Données** | `IBM Plex Mono`, `font-variant-numeric: tabular-nums` | plaques, kilométrages, montants, dates, numéros de contrat et de facture. |

**Asymétrie assumée, écrite noir sur blanc.** L'arabe ne se met pas en capitales et `Archivo` n'a
pas d'arabe. En `ar`, le niveau « affichage » est rendu en `IBM Plex Sans Arabic 700` à la même
taille optique, interlettrage +2 %, sans fausse graisse ni fausse extension. Le rendu arabe est
donc **différent** du rendu latin à ce niveau, et c'est un choix : mieux vaut deux traitements
justes qu'un seul traitement plaqué.

### Échelle

Deux bases, parce que les contextes n'ont rien à voir.

| Palier | App (base 15 px, ratio 1,2) | Vitrine (base 17 px, ratio 1,333) | Emploi |
|---|---|---|---|
| `display-xl` | — | 68 px / 0,95 | accroche |
| `display` | 31 px / 1,1 | 40 px / 1,15 | `h1`, grands nombres |
| `title` | 22 px / 1,25 | 30 px / 1,25 | `h2`, titre de fiche |
| `heading` | 18 px / 1,3 | 23 px / 1,35 | `h3`, en-tête de bloc |
| `body` | 15 px / 1,55 | 17 px / 1,65 | texte courant |
| `small` | 13 px / 1,45 | 15 px / 1,5 | libellés, aides |
| `micro` | 11 px / 1,3, capitales, +8 % d'interlettrage | 12 px | sur-titres, en-têtes de colonne, unités |

Le palier `micro` en capitales espacées est le seul ornement typographique autorisé. Il joue le
rôle des étiquettes gravées d'un tableau de bord, et il disparaît en arabe au profit d'un
`small` en `--muted`, les capitales n'existant pas.

---

## 3. Mise en page

> **Une phrase :** un rail d'outils à gauche, le document au centre, et le temps à droite.

### Application, poste fixe (≥ 1280 px)

```
┌────┬──────────────────────────────────────────────┬──────────────────┐
│ ▣  │  MARRAKECH · FLOTTE                     [+]  │  AUJOURD'HUI     │
│ ▤  │ ┌──────────────────────────────────────────┐ │ ──────────────── │
│ ▦  │ │ 12345│أ│6   Dacia Logan      ▓▓▓▓│░░░░░  │ │ ● Assurance      │
│ ▧  │ │ 44821│ب│1   Hyundai i10      ▓▓▓▓│░░░░░  │ │   4021-ج-6       │
│ ▨  │ │ 90312│د│6   Renault Clio     ▓▓▓▓│░░░░░  │ │   dépassée 3 j   │
│    │ │ 4021 │ج│6   Kia Picanto      ▓▓▓▓│░░░░░  │ │                  │
│    │ └──────────────────────────────────────────┘ │ ● Retour attendu │
│    │                                    ▲         │   10312-م-1 · 18h│
│ ⚙  │                            aujourd'hui       │                  │
└────┴──────────────────────────────────────────────┴──────────────────┘
  64px            fluide                                   320px
```

La colonne « aujourd'hui » n'est pas un panneau de notifications : c'est **la journée**, triée par
heure, toujours visible, jamais repliée sur poste fixe. En dessous de 1280 px elle devient un
tiroir ; en dessous de 768 px, une barre inférieure avec un compteur.

### Fiche véhicule — la signature (voir §4)

```
┌──────────────────────────────────────────────────────────────────────┐
│  12345│أ│6        DACIA LOGAN 2022 · DIESEL · MANUELLE               │
│                    118 420 km · relevé il y a 2 j                    │
├──────────────────────────────────────────────────────────────────────┤
│              ← passé                    │            futur →          │
│  ASSURANCE   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▒▒▒▒▒▒▒▒▒▒▒▒●               │
│  VISITE TQ   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓●▒│                            │
│  VIGNETTE    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒●     │
│  VIDANGE     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▒▒▒▒▒● ~12 j (est.)          │
│  CONTRATS    ▓▓▓ ▓▓▓▓▓▓  ▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓│▒▒▒▒▒▒▒▒                     │
│              │                          │                            │
│           −12 mois                 AUJOURD'HUI                +6 mois │
└──────────────────────────────────────────────────────────────────────┘
```

### Site vitrine

Colonne de texte de 62 caractères maximum, alignée sur une grille de 12 colonnes, marges généreuses.
L'accroche n'est pas une phrase : **c'est la frise en mouvement**, avec une échéance qui franchit la
ligne du jour et passe au rouge. Le produit se montre en fonctionnement, comme demandé au §7.

### Grille et rythme

Base **4 px**. Rangée de tableau 40 px en app, 48 px au toucher. Rayon : **3 px** sur les feuilles
et les champs, **6 px** sur le composant plaque, **jamais plus**. **Aucune ombre portée nulle
part** : l'élévation, c'est `--sheet` sur `--paper`. Les filets `--rule` ne servent qu'à
l'intérieur d'une feuille, jamais à découper la page — la page est découpée par le papier.

---

## 4. La signature — « la règle d'aujourd'hui »

Un seul objet, décliné à trois échelles, présent sur les trois surfaces. C'est la seule chose dont
on doit se souvenir.

**Le principe.** Le temps est un axe horizontal. Une **ligne verticale fixe** marque aujourd'hui.
Le passé est hachuré, le futur est lisse. Chaque obligation du véhicule — assurance, visite
technique, vignette, carte grise, vidange, contrats — occupe une voie et avance vers cette ligne.
On ne lit pas une date : **on voit la distance**.

| Échelle | Où | Forme |
|---|---|---|
| **XL** | fiche véhicule | frise complète, 12 mois en arrière, 6 en avant, 6 voies |
| **M** | ligne du tableau de flotte | mini-frise de 90 jours, **et l'axe est aligné sur toutes les lignes** : la ligne du jour traverse le tableau entier |
| **S** | partout ailleurs (listes, carte GPS, résultats de recherche) | pastille de 16 px, arc rempli proportionnel à la distance de l'échéance la plus proche |

**Le détail qui fait tout.** Dans le tableau de flotte, la ligne du jour est verticale, continue et
identique d'une rangée à l'autre. L'œil descend le long d'un fil, et **tout ce qui dépasse à gauche
est en retard**. Deux cents véhicules se lisent sans lire un seul chiffre. C'est aussi le seul
endroit d'un écran sain où `--signal` apparaît, sous forme d'un filet de 1 px.

**Sur le site vitrine**, cette frise **est** l'accroche : elle s'anime au chargement, une échéance
franchit la ligne et vire au rouge, puis le texte apparaît en dessous. Le produit se démontre avant
de se décrire.

### Le second objet mémorable : la plaque

Dans une agence marocaine, on ne dit pas « la Logan blanche », on dit « la 12345-أ-6 ». **La plaque
est le nom du véhicule.** Elle est donc traitée comme un objet typographique de premier rang, avec
son propre composant :

```
┌─────────────────┐
│ 12345 │ أ │ 6   │   IBM Plex Mono · chiffres tabulaires
└─────────────────┘   double filet vertical, comme sur la vraie plaque
```

Elle remplace le titre dans toutes les listes, toutes les fiches, tous les PDF et tous les emails.
Contraintes techniques héritées du §12 : isolation bidi obligatoire (`<bdi>` /
`unicode-bidi: isolate`) parce qu'elle mêle chiffres latins et lettre arabe et s'inverse sinon en
RTL ; chiffres forcés en `latn` même en `ar-MA` ; et prise en charge du **nouveau format unifié
publié au BO n° 7531 du 3 août 2026**, qui ajoute la lettre latine en regard de la lettre arabe
(voir `DECISIONS.md`, É-06). Le double filet vertical du composant est repris comme **motif
structurel** ailleurs dans l'interface : c'est lui qui sépare deux segments d'une même donnée, à la
place d'un séparateur générique.

---

## 5. Autocritique — « aurais-je produit ça pour n'importe quel autre brief ? »

Le protocole exige cette question. Voici honnêtement ce qui s'est passé.

### Ce que j'avais d'abord écrit (v1)

Direction *Atelier* : graphite, fond **crème**, accent **orange sécurité**, typographie
industrielle **condensée**, séparation par **filets fins**, **rayon zéro**, marquages au sol.

### La critique, sans complaisance

**Oui, je l'aurais produit pour n'importe quel autre brief.** Trois problèmes, et ils sont graves :

1. **Le crème plus terracotta est explicitement interdit par le §13 du cahier des charges**, et
   pour une bonne raison : c'est aujourd'hui l'un des trois réflexes visuels par défaut. Je l'avais
   contourné en appelant l'orange « orange sécurité » au lieu de « terracotta ». C'est un
   renommage, pas une décision.
2. **Filets fins partout plus rayon zéro plus colonnes denses** est un autre de ces réflexes, la
   mise en page « journal ». Elle a l'air rigoureuse, elle est surtout automatique. Le sérieux
   d'une interface ne vient pas de la suppression des rayons.
3. **Aucun des trois axes — couleur, typographie, structure — ne venait du Maroc, ni de la
   location, ni de l'échéance.** J'aurais livré la même chose pour un logiciel de maintenance
   industrielle allemand. C'est le symptôme décisif.

### Ce que j'ai changé, et pourquoi

| v1 | v2 | Raison |
|---|---|---|
| Fond crème (teinte jaune ~85) | `--paper` gris-vert froid (teinte 170) | Sort du réflexe crème et évoque le papier administratif marocain, pas le carnet de moleskine |
| Orange terracotta décoratif | `--signal` rouge du **triangle de présignalisation**, et **uniquement** pour l'urgence | La couleur cesse d'être une décoration : elle devient une information. Objet réellement présent dans chaque voiture de location |
| Palette avec un vert « succès » | **aucun vert, jamais** | Le bon état s'exprime par l'absence. C'est ce qui rend l'alerte lisible en une seconde |
| Séparation par filets partout | Séparation par **papier contre feuille**, filets réservés à l'intérieur d'une feuille | Évite la mise en page journal ; donne une métaphore physique cohérente : des documents posés sur un plan de travail |
| Rayon zéro | 3 px, et 6 px sur la plaque | Le rayon zéro est un tic. 3 px est un choix, discret, et il laisse la plaque se distinguer |
| Typographie condensée « industrielle » | `Archivo` **élargie** en affichage, `IBM Plex` en texte et en données | La condensée était l'accessoire attendu. L'élargie évoque l'étiquette de tableau de bord, et Plex règle sérieusement les trois écritures |
| Signature = une frise sur la fiche véhicule | Signature = **le même objet à trois échelles**, dont l'axe aligné à travers tout le tableau de flotte | Une signature qui n'apparaît que sur un écran n'est pas une signature. Alignée sur 200 lignes, elle devient l'argument de vente |
| Pas de second objet | **La plaque comme nom du véhicule**, partout | Vient directement de la façon dont les agences parlent. Aucun brief générique ne produit ça |

### Ce que j'ai retiré (la règle de Chanel)

Trois choses envisagées puis supprimées : les **marquages au sol** en bandes diagonales (pur
décor) ; une **géométrie de zellige** en fond de section sur le site vitrine (orientalisme
décoratif, sans rapport avec le métier d'un loueur, et qui aurait sonné faux pour un utilisateur
marocain) ; et une **police d'affichage arabe distincte** de la police de texte (deux familles
arabes à accorder pour un gain marginal, un risque de désaccord élevé).

### Ce qui reste fragile dans cette direction

Trois faiblesses connues, à surveiller pendant la Phase 1 :

- **L'absence de vert** peut désorienter un utilisateur qui cherche une confirmation visuelle après
  une action. Parade prévue : les confirmations passent par le **mouvement et le texte**, pas par
  la couleur. À vérifier sur un utilisateur réel avant la fin de la Phase 3 ; si ça échoue, la
  décision saute et je l'écris.
- **`Archivo` élargie en capitales** peut devenir criarde si elle s'échappe du strict périmètre
  défini. Un test doit compter ses occurrences.
- **Tout repose sur `--signal`.** Si la frise est mal exécutée, il ne reste qu'une interface grise.
  Le risque de la restriction, c'est qu'elle ne pardonne rien.

---

## 6. Icônes — jeu maison

Grille **24 px**, trait **1,75 px**, **terminaisons droites** (`butt`), **jonctions en onglet**
(`miter`), rayon d'angle 2 px maximum, aucune ombre, aucun remplissage sauf état actif. Les objets
sont dessinés **en élévation orthogonale** — de face ou de profil strict, jamais en perspective —
comme sur une planche d'atelier. Exportées en composants React dans `src/ui/icons/`.

Jeu minimal exigé par le §13, 21 icônes : voiture de face, voiture de profil, clé, contrat signé,
bouclier d'assurance, bidon d'huile, jauge de vidange, pignon d'entretien, badge de visite
technique, vignette, GPS, geofence, carburant, compteur, amende, caution, client avec permis,
panne, agence, facture, plan tarifaire.

**Miroir en RTL** : sont retournées les icônes **directionnelles** (flèches, retour, suivant,
entrée/sortie de geofence, tri). Ne sont **jamais** retournées les icônes d'**objets** (voiture,
clé, bidon, compteur, plaque) : une voiture retournée est une voiture qui roule à l'envers, pas une
voiture arabe.

---

## 7. Mouvement et états de chargement

Durées : **120 ms** pour un état de survol ou de focus, **220 ms** pour l'apparition d'un panneau,
**450 ms** pour la seule séquence orchestrée du produit, l'animation d'accroche du site vitrine.
Courbe unique : `cubic-bezier(0.2, 0, 0, 1)`. `prefers-reduced-motion: reduce` supprime toute
translation et conserve les fondus, y compris sur l'accroche, qui affiche alors son état final.

**Barre de progression supérieure**, maison, 2 px, en `--signal`, branchée sur
`router.state.status` et `useIsFetching()`. Apparition après **150 ms** (`pendingMs`), maintien
minimum **400 ms** (`pendingMinMs`). En dessous de 150 ms, rien ne s'affiche : une barre qui
clignote donne l'impression d'un produit lent, pas rapide.

**Squelettes** : reproduction exacte de la géométrie réelle — mêmes hauteurs de rangée, mêmes
largeurs de colonne, même nombre de lignes que la page précédente si elle est connue, pour qu'aucun
décalage ne se produise à l'arrivée des données. Un squelette par zone : tableau de bord, tableau
des véhicules, fiche véhicule, liste d'alertes, carte GPS, tableau des organisations dans `/admin`.
**Jamais de squelette pour un rafraîchissement en arrière-plan** : le contenu reste, seule la barre
supérieure bouge.

**États vides** : une phrase qui dit quoi faire, et le bouton qui le fait. **États d'erreur** : ce
qui s'est passé, et l'action suivante. Ni excuse, ni humour, ni code technique affiché à
l'utilisateur.

---

## 8. Plancher de qualité

Responsive jusqu'à **360 px** avec usage à une main : les actions primaires restent dans le tiers
inférieur de l'écran. Cibles tactiles **44 px** minimum, portées à 48 px sur la carte GPS.
Focus clavier **visible et propre au produit** : contour de 2 px en `--ink` avec un décalage de
2 px, jamais l'anneau du navigateur, jamais `outline: none`. Contraste **AA** vérifié sur les deux
thèmes, y compris `--muted` sur `--sheet` (4,6:1) et `--signal` sur `--paper` (4,8:1) — mesuré, pas
supposé. Aucune information portée **par la seule couleur** : chaque état d'échéance porte aussi une
position sur la frise et un texte.

---

## 9. Ce que la Phase 1 doit livrer de ce document

1. `src/ui/tokens.css` — les 6 couleurs, les deux thèmes, l'échelle typographique, la grille de
   4 px, la courbe et les durées, en variables CSS consommées par le `@theme` de Tailwind 4.
2. Les trois familles auto-hébergées en `woff2`, sous-ensembles latin / latin-ext / arabe,
   préchargées, avec `size-adjust` mesuré pour que la bascule fr → ar ne fasse pas sauter la mise en
   page.
3. Les 21 icônes.
4. Le composant `<Plate />` avec son isolation bidi et ses trois formats.
5. Le composant `<Deadline />` aux trois échelles (XL, M, S) — **la signature avant les écrans**,
   parce que c'est lui qui décide de la crédibilité du reste.
6. La barre de progression et les six squelettes.
