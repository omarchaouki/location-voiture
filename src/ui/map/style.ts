/**
 * Le fond de carte.
 *
 * Deux décisions, et la seconde est un choix de produit autant que de technique.
 *
 * 1. **Aucune couleur littérale, ici non plus.** Un style MapLibre est un JSON qui
 *    exige des couleurs. On les LIT donc sur les jetons CSS au moment du rendu :
 *    la carte suit le thème clair/sombre comme le reste, sans qu'une seule teinte
 *    soit recopiée. C'est la seule façon de respecter la charte sur une surface qui
 *    ne connaît pas Tailwind.
 *
 * 2. **Aucun fournisseur de tuiles n'est contacté par défaut.** Sans `MAP_STYLE_URL`
 *    configurée, la carte affiche un plan vierge : les véhicules, les traces et les
 *    zones s'y voient parfaitement, mais aucune requête ne part vers un tiers.
 *    Choisir un fournisseur (MapTiler, OpenFreeMap, un serveur de tuiles maison)
 *    engage des conditions d'usage et une adresse IP envoyée à chaque déplacement de
 *    la carte : c'est une décision de déploiement, pas un défaut à hériter.
 */

export interface MapPalette {
  paper: string
  surfaceSunken: string
  rule: string
  ink: string
}

/** Lit les jetons de rôle sur l'élément racine. Aucune valeur en dur. */
export function readMapPalette(): MapPalette {
  const styles = getComputedStyle(document.documentElement)
  const token = (name: string) => styles.getPropertyValue(name).trim()

  return {
    paper: token('--paper'),
    surfaceSunken: token('--surface-sunken'),
    rule: token('--rule'),
    ink: token('--ink'),
  }
}

/**
 * Plan vierge : un fond, un filet de cadre. Rien d'autre.
 *
 * Ce n'est pas un pis-aller honteux — sur une flotte urbaine, ce qui se lit est la
 * position relative des voitures et des zones, et un fond de carte chargé les rend
 * souvent MOINS lisibles. Le fond de carte reste souhaitable pour se repérer dans
 * une ville qu'on ne connaît pas ; il s'active par configuration.
 */
export function blankStyle(palette: MapPalette): unknown {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'paper', type: 'background', paint: { 'background-color': palette.paper } }],
  }
}
