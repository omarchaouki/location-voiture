import { useSyncExternalStore } from 'react'

/**
 * REACT A-T-IL PRIS LA MAIN ?
 *
 * Faux pendant le rendu serveur et pendant la toute première passe du navigateur,
 * vrai dès que l'hydratation est faite.
 *
 * **Pourquoi ce crochet existe, et ce qu'il corrige.** Les formulaires du produit
 * portent `method="post"` : c'est la ceinture de sécurité du jour où le JavaScript ne
 * s'exécute pas, pour que le navigateur n'envoie pas l'adresse et le mot de passe
 * dans l'URL (docs/DECISIONS.md §13.7). Mais elle a un angle mort : entre l'affichage
 * du HTML et la fin de l'hydratation, il s'écoule un délai — court en production,
 * plusieurs secondes sur un serveur de développement qui réoptimise ses dépendances.
 * Quelqu'un qui tape vite et valide dans cet intervalle déclenche la soumission
 * NATIVE : la page se recharge, et rien ne se passe.
 *
 * Vu le 26/08/2026 sur l'écran de connexion : « la page rafraîchit et je ne me
 * connecte pas ». Deux symptômes, une seule cause.
 *
 * Le bouton se désactive donc tant que ce crochet renvoie faux. Ce n'est pas une
 * dégradation : c'est la vérité de l'état du document, dite à l'utilisateur au lieu
 * de lui laisser croire que son geste a été pris en compte.
 */
function subscribeNever(): () => void {
  return () => {}
}

function readTrue(): boolean {
  return true
}

function readFalse(): boolean {
  return false
}

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, readTrue, readFalse)
}
