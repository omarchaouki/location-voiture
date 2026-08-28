import { createContext, useContext, type ReactNode } from 'react'

import type { NotificationsState } from './use-notifications'

/**
 * L'ÉTAT DES NOTIFICATIONS, PARTAGÉ.
 *
 * Le sondage tourne une seule fois, dans la coquille (`$lang/app.tsx`), et deux écrans
 * en ont besoin :
 *
 *  - la NAVIGATION, qui porte la pastille rouge sur la rubrique « Alertes » ;
 *  - la page ALERTES elle-même, qui marque comme lu et doit faire descendre cette
 *    pastille immédiatement, sans attendre le prochain tour de sonde.
 *
 * Sans contexte partagé, la page marquerait ses alertes comme lues et la pastille
 * garderait son ancien nombre jusqu'à une minute — l'utilisateur cliquerait deux fois,
 * puis cesserait de croire au compteur.
 *
 * Il n'y a pas de second sondage : le contexte transporte l'état existant, il n'en
 * crée pas.
 */
const NotificationsContext = createContext<NotificationsState | null>(null)

export function NotificationsProvider({
  state,
  children,
}: {
  state: NotificationsState
  children: ReactNode
}) {
  return <NotificationsContext.Provider value={state}>{children}</NotificationsContext.Provider>
}

/**
 * `null` hors de l'espace client — la plateforme (`/admin`) n'a pas d'échéances.
 * L'appelant décide quoi en faire ; on ne lève pas, un écran ne doit pas tomber
 * parce qu'une pastille manque.
 */
export function useNotificationsState(): NotificationsState | null {
  return useContext(NotificationsContext)
}
