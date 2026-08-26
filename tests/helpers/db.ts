import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import { createDb, type Db } from '~/db/client'
import type { TenantContext } from '~/db/tenant'

/** Base en mémoire, migrée, isolée pour chaque test. */
export function createTestDb(): Db {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: './drizzle' })
  return db
}

export function tenant(orgId: string, overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    orgId,
    userId: `user-${orgId}`,
    role: 'owner',
    planCode: 'pro',
    impersonated: false,
    canWrite: true,
    isDemo: false,
    ...overrides,
  }
}
