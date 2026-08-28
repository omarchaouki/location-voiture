import { and, desc, eq, isNull } from 'drizzle-orm'

import type { Db } from '../client'
import { organizations } from '../schema/auth'
import { planChangeRequests } from '../schema/billing'
import { nowIso } from '../schema/_shared'
import type { TenantContext } from '../tenant'
import { forOrg } from './base'

/**
 * DEMANDES DE CHANGEMENT D'OFFRE — les deux côtés de la même table.
 *
 * Le client DEMANDE, la plateforme DÉCIDE, et les deux accès sont ici pour une raison
 * précise : `plan_change_requests` porte un `org_id`, elle est donc cloisonnée, et
 * `pnpm check:hardcoded` refuse tout accès direct hors de `src/db/repositories/`.
 *
 *  - `planChangeRepository(db, ctx)` est le repository ORDINAIRE : une agence ne voit
 *    que ses propres demandes, comme pour n'importe quelle table métier ;
 *  - `pendingPlanChanges` et `decidePlanChange` regardent TOUTES les organisations.
 *    Ce sont des actes de plateforme, au même titre que `platformMetrics`, et chaque
 *    appelant passe d'abord par `requirePlatformOwner`.
 *
 * Les fonctions de plateforme ne renvoient que l'entête d'une organisation — nom,
 * offre, motif — jamais une ligne métier. Le propriétaire de plateforme qui veut voir
 * les données d'une agence passe par l'impersonation, tracée et limitée.
 */

export type PlanChangeRow = typeof planChangeRequests.$inferSelect

export function planChangeRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<PlanChangeRow>(db, ctx, planChangeRequests)

  return {
    ...base,

    /** La demande EN ATTENTE de cette agence, s'il y en a une. Il ne peut y en avoir qu'une. */
    async pending(): Promise<PlanChangeRow | null> {
      const rows = await base.list(eq(planChangeRequests.status, 'pending'))
      return rows[0] ?? null
    },
  }
}

export interface PendingPlanChange {
  id: string
  orgId: string
  organizationName: string
  currentPlanCode: string
  requestedPlanCode: string
  reason: string | null
  requestedAt: string
}

/** Les demandes en attente, toutes agences confondues. Acte de plateforme. */
export async function pendingPlanChanges(db: Db): Promise<PendingPlanChange[]> {
  const rows = await db
    .select({
      id: planChangeRequests.id,
      orgId: planChangeRequests.orgId,
      organizationName: organizations.name,
      currentPlanCode: planChangeRequests.currentPlanCode,
      requestedPlanCode: planChangeRequests.requestedPlanCode,
      reason: planChangeRequests.reason,
      requestedAt: planChangeRequests.createdAt,
    })
    .from(planChangeRequests)
    .innerJoin(organizations, eq(organizations.id, planChangeRequests.orgId))
    .where(
      and(
        eq(planChangeRequests.status, 'pending'),
        isNull(planChangeRequests.deletedAt),
        isNull(organizations.deletedAt),
      ),
    )
    .orderBy(desc(planChangeRequests.createdAt))

  return rows.map((row) => ({ ...row, organizationName: row.organizationName ?? row.orgId }))
}

export interface PlanChangeDecision {
  requestId: string
  adminUserId: string
  approve: boolean
  note?: string | null
}

/**
 * La décision, et son effet.
 *
 * **L'offre de l'organisation n'est écrite QUE sur approbation, et depuis ici.** C'est
 * ce qui garantit qu'un changement d'offre laisse toujours une demande derrière lui :
 * si le back-office pouvait écrire `organizations.plan_code` directement, la moitié
 * des changements n'auraient plus de trace ni de motif.
 *
 * Rend `null` si la demande n'existe plus ou n'est plus en attente — deux
 * administrateurs qui tranchent la même demande, le second ne doit pas la re-trancher.
 */
export async function decidePlanChange(
  db: Db,
  decision: PlanChangeDecision,
): Promise<PendingPlanChange | null> {
  const rows = await db
    .select({
      id: planChangeRequests.id,
      orgId: planChangeRequests.orgId,
      currentPlanCode: planChangeRequests.currentPlanCode,
      requestedPlanCode: planChangeRequests.requestedPlanCode,
      reason: planChangeRequests.reason,
      requestedAt: planChangeRequests.createdAt,
    })
    .from(planChangeRequests)
    .where(
      and(
        eq(planChangeRequests.id, decision.requestId),
        eq(planChangeRequests.status, 'pending'),
        isNull(planChangeRequests.deletedAt),
      ),
    )
    .limit(1)

  const request = rows[0]
  if (!request) return null

  const now = nowIso()
  await db
    .update(planChangeRequests)
    .set({
      status: decision.approve ? 'approved' : 'refused',
      decidedBy: decision.adminUserId,
      decidedAt: now,
      decisionNote: decision.note ?? null,
      updatedAt: now,
    })
    .where(eq(planChangeRequests.id, request.id))

  if (decision.approve) {
    await db
      .update(organizations)
      .set({ planCode: request.requestedPlanCode })
      .where(eq(organizations.id, request.orgId))
  }

  return { ...request, organizationName: request.orgId }
}
