import { createHash } from 'node:crypto'

import { getDb, type Db } from '~/db/client'
import { auditLog } from '~/db/schema/platform'

/**
 * Journal d'audit.
 *
 * Obligatoire sur : contrats, cautions, prix, suppressions, changements de plan et
 * impersonation (cahier des charges §15). Ici en Phase 2 : tout ce que fait le
 * super administrateur, et tout ce qui se passe pendant une impersonation.
 *
 * L'adresse IP est HACHÉE, jamais conservée en clair : on veut pouvoir corréler deux
 * actions, pas ficher un utilisateur.
 */

export interface AuditEntry {
  orgId?: string | null
  actorUserId?: string | null
  actingAsOrgId?: string | null
  impersonated?: boolean
  action: string
  entityType?: string | null
  entityId?: string | null
  before?: unknown
  after?: unknown
  request?: { ip?: string | null; userAgent?: string | null }
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return createHash('sha256').update(ip).digest('hex').slice(0, 32)
}

export async function audit(entry: AuditEntry, db: Db = getDb()): Promise<void> {
  await db.insert(auditLog).values({
    orgId: entry.orgId ?? null,
    actorUserId: entry.actorUserId ?? null,
    actingAsOrgId: entry.actingAsOrgId ?? null,
    impersonated: entry.impersonated ?? false,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    beforeJson: entry.before === undefined ? null : JSON.stringify(entry.before),
    afterJson: entry.after === undefined ? null : JSON.stringify(entry.after),
    ipHash: hashIp(entry.request?.ip),
    userAgent: entry.request?.userAgent ?? null,
  })
}
