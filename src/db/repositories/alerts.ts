import { and, eq, inArray, isNull, ne } from 'drizzle-orm'

import type { Db } from '../client'
import { alertReads, alerts } from '../schema/alerts'
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
export type AlertReadRow = typeof alertReads.$inferSelect

export function alertRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<AlertRow>(db, ctx, alerts)
  const reads = forOrg<AlertReadRow>(db, ctx, alertReads)

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
    /**
     * Les alertes que CETTE personne a déjà vues dans sa cloche.
     *
     * Rendue en `Set` plutôt qu'en lignes : l'appelant ne pose jamais qu'une question,
     * « celle-ci est-elle lue », et un `Set` la répond sans que chaque appelant
     * reconstruise le sien.
     */
    async readIdsFor(userId: string): Promise<Set<string>> {
      const rows = await reads.list(eq(alertReads.userId, userId))
      return new Set(rows.map((row) => row.alertId))
    },

    /**
     * Marque comme lues, pour une personne, les alertes données.
     *
     * `onConflictDoNothing` sur `alert_reads_unique` : relire ce qui est déjà lu ne
     * doit rien écrire, et surtout pas échouer. La cloche appelle cette fonction avec
     * tout ce qu'elle affiche — c'est à la base de trier, pas à l'écran de savoir.
     *
     * `assertCanWrite` est volontairement ABSENT. Une lecture est un fait personnel :
     * un rôle `viewer`, ou une organisation gelée par un impayé, doivent pouvoir faire
     * taire leur propre pastille. Le seul cas refusé — l'administrateur qui consulte
     * sans être élevé — est traité une couche au-dessus, dans la server function, parce
     * que c'est là qu'il a un sens : il ne s'agit pas d'un droit d'écriture manquant,
     * mais de ne pas marquer comme lues les notifications de QUELQU'UN D'AUTRE.
     */
    async markRead(
      alertIds: ReadonlyArray<string>,
      userId: string,
      now: string,
    ): Promise<number> {
      if (alertIds.length === 0) return 0

      return withTenant(db, ctx, async (tx) => {
        const inserted = await tx
          .insert(alertReads)
          .values(
            alertIds.map((alertId) => ({
              orgId: ctx.orgId,
              alertId,
              userId,
              readAt: now,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: alertReads.id })
        return inserted.length
      })
    },

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
