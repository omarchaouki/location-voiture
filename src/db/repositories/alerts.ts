import { and, eq, inArray, isNull, ne } from 'drizzle-orm'

import type { Db } from '../client'
import { alerts } from '../schema/alerts'
import { assertCanWrite, withTenant, type TenantContext } from '../tenant'
import { forOrg } from './base'

/**
 * Repository des alertes.
 *
 * Il existe pour une raison précise : la réconciliation du moteur d'alertes écrivait
 * ses trois requêtes directement dans `src/server/alert-scan.ts`. Elles étaient
 * correctement filtrées — mais elles étaient hors des repositories, donc hors de la
 * seule couche que le contrôle automatique surveille. `pnpm check:hardcoded` refuse
 * désormais cette forme (règle « aucun accès à une table cloisonnée hors repository »,
 * enfin rendue exécutable en Phase 8).
 *
 * Les trois opérations gardent leur sémantique exacte : c'est un déplacement, pas une
 * réécriture. L'idempotence reste portée par l'index unique, comme avant.
 */

export type AlertRow = typeof alerts.$inferSelect

export function alertRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<AlertRow>(db, ctx, alerts)

  return {
    ...base,

    /** Alertes vivantes : tout sauf ce qui est déjà refermé. */
    async live(): Promise<AlertRow[]> {
      return base.list(ne(alerts.state, 'resolved'))
    },

    /**
     * Pose les alertes manquantes.
     *
     * `onConflictDoNothing` sur `alerts_identity_unique` : c'est ICI que se joue
     * l'idempotence du moteur, et nulle part ailleurs. Relancer le balayage dix fois
     * ne crée rien.
     */
    async createMissing(
      rows: ReadonlyArray<Omit<typeof alerts.$inferInsert, 'orgId'>>,
    ): Promise<number> {
      if (rows.length === 0) return 0
      assertCanWrite(ctx)

      return withTenant(db, ctx, async (tx) => {
        const inserted = await tx
          .insert(alerts)
          .values(rows.map((row) => ({ ...row, orgId: ctx.orgId })))
          .onConflictDoNothing()
          .returning({ id: alerts.id })
        return inserted.length
      })
    },

    /** Rafraîchit la dernière observation d'alertes toujours voulues. */
    async touchLastSeen(ids: ReadonlyArray<string>, now: string): Promise<number> {
      if (ids.length === 0) return 0
      assertCanWrite(ctx)

      await withTenant(db, ctx, async (tx) => {
        await tx
          .update(alerts)
          .set({ lastSeenAt: now })
          .where(and(eq(alerts.orgId, ctx.orgId), inArray(alerts.id, [...ids])))
      })
      return ids.length
    },

    /**
     * Referme ce qui n'a plus lieu d'être.
     *
     * Une alerte ne se supprime jamais : elle se résout, et le moteur la rouvrira si
     * la cause revient. C'est ce qui empêche de faire disparaître un problème en
     * cliquant.
     */
    async resolve(ids: ReadonlyArray<string>, now: string): Promise<number> {
      if (ids.length === 0) return 0
      assertCanWrite(ctx)

      await withTenant(db, ctx, async (tx) => {
        await tx
          .update(alerts)
          .set({ state: 'resolved', resolvedAt: now })
          .where(
            and(
              eq(alerts.orgId, ctx.orgId),
              ne(alerts.state, 'resolved'),
              isNull(alerts.deletedAt),
              inArray(alerts.id, [...ids]),
            ),
          )
      })
      return ids.length
    },
  }
}
