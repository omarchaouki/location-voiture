/**
 * Greffon de mise en forme de l'arabe pour MapLibre.
 *
 * Sans lui, un nom de rue arabe sort sur la carte en lettres ISOLÉES et dans
 * l'ordre inverse : illisible, sans qu'aucune erreur ne soit levée. MapLibre ne le
 * charge pas tout seul — il faut le lui donner (docs/DECISIONS.md §12.1).
 *
 * Le fichier est AUTO-HÉBERGÉ dans `public/vendor/`, jamais pris sur un CDN : il est
 * récupéré par `fetch` puis évalué dans le worker de MapLibre, ce qui en fait un
 * vecteur d'exécution de code. `pnpm vendor:rtl` le recopie depuis le paquet
 * installé, et `tests/unit/rtl-text-vendor.test.ts` échoue si les deux divergent.
 *
 * Ce module n'importe PAS `maplibre-gl` au chargement : il est lu par un test Node
 * et par le rendu serveur, où le paquet n'a rien à faire.
 */

/** Doit rester égale à la version du paquet installé — le test le vérifie. */
export const RTL_TEXT_PLUGIN_VERSION = '0.4.0'

export const RTL_TEXT_PLUGIN_URL = `/vendor/mapbox-gl-rtl-text-${RTL_TEXT_PLUGIN_VERSION}.js`

let started: Promise<void> | undefined

/**
 * Charge le greffon, une seule fois par page.
 *
 * `lazy = false` : on ne diffère pas. Le chargement paresseux n'agit qu'au premier
 * texte RTL rencontré, ce qui produit un rendu qui se corrige tout seul une seconde
 * après — l'utilisateur voit passer l'arabe cassé. 133 Ko en parallèle des tuiles
 * coûtent moins cher que ce clignotement.
 *
 * L'appel se résout sans qu'aucune carte n'existe (273 ms mesurés, §12.3) : il n'a
 * pas à être ordonné par rapport à la création de la carte.
 */
export async function ensureRtlTextPlugin(): Promise<void> {
  if (typeof window === 'undefined') return
  started ??= load()
  return started
}

async function load(): Promise<void> {
  const { getRTLTextPluginStatus, setRTLTextPlugin } = await import('maplibre-gl')
  if (getRTLTextPluginStatus() !== 'unavailable') return
  await setRTLTextPlugin(RTL_TEXT_PLUGIN_URL, false)
}
