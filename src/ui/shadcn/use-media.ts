import { useSyncExternalStore } from 'react'

/** Point de rupture des coquilles : en dessous, la navigation devient un tiroir. */
export const MOBILE_BREAKPOINT = 768

/*
 * La largeur de la fenêtre et le sens de lecture sont des états EXTERNES à React :
 * ils vivent dans le navigateur et dans le DOM. On les lit donc avec
 * `useSyncExternalStore`, exactement comme le thème (`src/ui/theme/theme.tsx`), et
 * non avec un `useState` + `useEffect` — ce montage-là produit un rendu en cascade et
 * fait sauter la mise en page une frame après l'hydratation.
 *
 * Les deux instantanés serveur renvoient la valeur NEUTRE (écran large, lecture de
 * gauche à droite) : le serveur ne connaît ni l'un ni l'autre, et un pari optimiste y
 * coûterait une divergence d'hydratation.
 */

function subscribeViewport(onChange: () => void): () => void {
  const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function readIsMobile(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

function readFalse(): boolean {
  return false
}

/** Vrai en dessous de 768 px. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeViewport, readIsMobile, readFalse)
}

/**
 * Sens de lecture courant.
 *
 * Radix ne connaît que des côtés PHYSIQUES (`left` / `right`) pour placer une
 * infobulle ou un menu. En arabe, un panneau posé « à droite » sort de l'écran. Ce
 * crochet est le seul endroit du produit autorisé à traduire un côté logique en côté
 * physique.
 *
 * L'attribut `dir` ne change qu'avec la langue, donc avec l'URL, donc avec un
 * remontage complet : il n'y a rien à écouter, et l'abonnement est un no-op.
 */
function subscribeNever(): () => void {
  return () => {}
}

function readIsRtl(): boolean {
  return document.documentElement.dir === 'rtl'
}

export function useIsRtl(): boolean {
  return useSyncExternalStore(subscribeNever, readIsRtl, readFalse)
}
