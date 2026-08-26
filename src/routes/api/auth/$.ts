import { createFileRoute } from '@tanstack/react-router'

import { getAuth } from '~/auth/server'

/**
 * Point d'entrée HTTP de Better Auth : `/api/auth/*`.
 *
 * C'est la SEULE surface réseau de l'authentification. Elle porte déjà ses propres
 * contrôles — dont le refus d'inscription sans invitation (`src/auth/server.ts`) —
 * parce qu'on ne peut pas compter sur l'absence d'une page pour interdire un appel.
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => getAuth().handler(request),
      POST: ({ request }) => getAuth().handler(request),
    },
  },
})
