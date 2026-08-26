import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { requirePlatformOwner, requireTenant } from '~/auth/context'
import { assertCanWrite } from '~/db/tenant'

/**
 * Middlewares de server function.
 *
 * `tenantMiddleware` est le point de passage obligé de toute fonction qui touche aux
 * données d'un client : il construit le `TenantContext` depuis la SESSION, jamais
 * depuis un paramètre. Une server function métier qui ne l'utilise pas est un bug.
 */
export const tenantMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { headers } = getRequest()
  const tenant = await requireTenant(headers)
  return next({ context: { tenant } })
})

/**
 * Même chose, plus le droit d'écrire. À utiliser sur toute mutation : il refuse
 * l'impersonation non élevée, l'abonnement gelé, l'organisation suspendue et le rôle
 * `viewer` — avant que la moindre ligne ne soit touchée.
 */
export const writableTenantMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const { headers } = getRequest()
    const tenant = await requireTenant(headers)
    assertCanWrite(tenant)
    return next({ context: { tenant } })
  },
)

/** Actes de plateforme (`/admin`). Refuse aussi une session en impersonation. */
export const platformMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { headers } = getRequest()
  const platform = await requirePlatformOwner(headers)
  return next({ context: { platform } })
})
