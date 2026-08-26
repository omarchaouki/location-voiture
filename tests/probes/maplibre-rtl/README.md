# Sonde MapLibre × greffon RTL

Elle répond à la question laissée ouverte en Phase 0 (`docs/DECISIONS.md` §9, point 3) :
**MapLibre 6.5 fonctionne-t-il avec `@mapbox/mapbox-gl-rtl-text`, et dans quelle version ?**

Elle n'est pas jouée par `pnpm test` : elle a besoin d'un vrai navigateur, d'un vrai
worker et d'un vrai contexte WebGL. C'est une expérience, pas une régression.

## Rejouer

```
pnpm add -D @mapbox/mapbox-gl-rtl-text@0.2.3   # puis 0.3.0, puis 0.4.0
mkdir -p tests/probes/maplibre-rtl/public/plugins
# copier chaque dist sous le nom rtl-<version>.js
npx vite tests/probes/maplibre-rtl --port 5199
```

Puis ouvrir, dans l'ordre :

| URL | Ce qu'on lit dans `window.__probe` |
|---|---|
| `/?v=0.2.3` `/?v=0.3.0` `/?v=0.4.0` | `status`, `shaping`, `glyphRanges`, `inkedPixels` |
| `/?plugin=off` | le témoin : sans greffon |
| `/nomap.html?v=0.4.0` | la promesse se résout-elle sans carte ? |

## Ce qui fait preuve

**Les plages de glyphes demandées.** MapLibre demande les glyphes par tranches Unicode.
Sans greffon : `0-255` et `1536-1791` (bloc arabe de base) — les lettres sortent
isolées et dans le mauvais ordre. Avec greffon : s'ajoute **`65024-65279`**, le bloc
des *formes de présentation arabes B*. Cette plage ne peut apparaître que si le texte
a été mis en forme avant la recherche de glyphes : c'est la signature du greffon dans
le vrai chemin de rendu, pas une déclaration d'API.

`probe-worker.mjs` reproduit à l'identique le chargeur de MapLibre 6.5 (`fetch` puis
`globalThis.eval` dans un worker *module*) et appelle les fonctions du greffon sur du
texte arabe — c'est ce qui distingue « le greffon se charge » de « le greffon marche ».

## Le décalque à connaître

Le volet navigateur de l'agent ne composite pas : `requestAnimationFrame` ne se
déclenche jamais et la carte ne rend **rien** — style jamais chargé, aucune requête.
`index.html` remplace donc rAF par un minuteur (désactivable par `?raf=native`).
WebGL, lui, dessine sans compositing : `readPixels` reste fiable.
