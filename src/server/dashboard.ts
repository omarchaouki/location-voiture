import { createServerFn } from '@tanstack/react-start'

import { getDb } from '~/db/client'
import { tenantMiddleware } from './middleware'
import { readAgencyOverview, type AgencyOverview } from './reads/overview'

/**
 * Tableau de bord de l'agence.
 *
 * La lecture vit dans `src/server/reads/overview.ts` : le corps d'un
 * `createServerFn` n'est pas appelable depuis un test sans requête HTTP, et le
 * compte de requêtes doit rester mesurable (docs/DECISIONS.md §13.7).
 */
export const fetchAgencyOverview = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<AgencyOverview> => {
    return readAgencyOverview(getDb(), context.tenant)
  })
