import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import { routeTree } from './routeTree.gen'
import { ErrorState, NotFoundState } from './ui/feedback/states'

/**
 * Le routeur est créé UNE FOIS PAR REQUÊTE côté serveur : le `QueryClient` ne doit
 * jamais être partagé entre deux visiteurs, sinon les données d'une organisation
 * seraient servies à une autre depuis le cache.
 */
export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Assez pour éviter un aller-retour au moindre focus, assez court pour
        // qu'une échéance modifiée ailleurs remonte vite.
        staleTime: 30_000,
        retry: 1,
      },
    },
  })

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Avec l'intégration Query, le routeur ne doit pas remettre en cache par-dessus.
    defaultPreloadStaleTime: 0,
    // Les deux seuils de la barre de progression, appliqués aussi aux routes.
    defaultPendingMs: 150,
    defaultPendingMinMs: 400,
    scrollRestoration: true,
    defaultErrorComponent: ({ error, reset }) => <ErrorState error={error} reset={reset} />,
    defaultNotFoundComponent: () => <NotFoundState />,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
