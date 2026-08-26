import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'

import type { Db } from '../client'
import { nowIso } from '../schema/_shared'
import { assertCanWrite, withTenant, type TenantContext } from '../tenant'

/**
 * LA règle du projet, rendue impossible à contourner.
 *
 * Ce module n'exporte AUCUNE fonction qui accepte une requête sans `TenantContext`.
 * Un repository se construit par `forOrg(db, ctx)` et capture le `orgId` en fermeture :
 * il n'existe donc aucun chemin d'appel capable de l'omettre — ce n'est pas une
 * convention que l'on peut oublier, c'est une signature qui n'existe pas.
 *
 * Tant qu'on est sur SQLite, c'est la SEULE barrière (pas de RLS). Voir
 * docs/DECISIONS.md §4 et §6, et tests/unit/tenant-isolation.test.ts.
 */

/** Toute table métier expose ces trois colonnes — c'est la charte. */
export type OrgScopedTable = SQLiteTable & {
  id: SQLiteColumn
  orgId: SQLiteColumn
  deletedAt: SQLiteColumn
}

export interface OrgRepository<TRow> {
  /** Lignes vivantes de CETTE organisation, uniquement. */
  list(where?: SQL): Promise<TRow[]>
  /**
   * Ligne d'une autre organisation → `undefined`, jamais la ligne.
   * L'appelant renvoie alors 404 et non 403 : ne pas révéler l'existence.
   */
  findById(id: string): Promise<TRow | undefined>
  count(where?: SQL): Promise<number>
  insert(values: Record<string, unknown>): Promise<TRow>
  update(id: string, values: Record<string, unknown>): Promise<TRow | undefined>
  softDelete(id: string): Promise<boolean>
  restore(id: string): Promise<boolean>
}

/**
 * Construit un repository borné à une organisation.
 *
 * @param db  connexion
 * @param ctx contexte de locataire — obligatoire, jamais optionnel
 */
export function forOrg<TRow>(
  db: Db,
  ctx: TenantContext,
  table: OrgScopedTable,
): OrgRepository<TRow> {
  /** Filtre appliqué à CHAQUE lecture et à chaque écriture. Il n'y a pas d'échappatoire. */
  const scope = (extra?: SQL): SQL =>
    and(eq(table.orgId, ctx.orgId), isNull(table.deletedAt), ...(extra ? [extra] : []))!

  return {
    async list(where) {
      return withTenant(db, ctx, async (tx) =>
        (await tx.select().from(table).where(scope(where))) as TRow[],
      )
    },

    async findById(id) {
      return withTenant(db, ctx, async (tx) => {
        const rows = (await tx
          .select()
          .from(table)
          .where(scope(eq(table.id, id)))
          .limit(1)) as TRow[]
        return rows[0]
      })
    },

    async count(where) {
      return withTenant(db, ctx, async (tx) => {
        const rows = await tx
          .select({ value: sql<number>`count(*)` })
          .from(table)
          .where(scope(where))
        return rows[0]?.value ?? 0
      })
    },

    async insert(values) {
      assertCanWrite(ctx)
      return withTenant(db, ctx, async (tx) => {
        // `orgId` est écrasé, jamais lu depuis l'entrée : une charge utile qui
        // porterait un `orgId` d'une autre organisation est simplement ignorée.
        const rows = (await tx
          .insert(table)
          .values({ ...values, orgId: ctx.orgId })
          .returning()) as TRow[]
        const created = rows[0]
        if (!created) throw new Error('insert returned no row')
        return created
      })
    },

    async update(id, values) {
      assertCanWrite(ctx)
      return withTenant(db, ctx, async (tx) => {
        const { orgId: _ignored, id: _keep, ...safe } = values
        const rows = (await tx
          .update(table)
          .set({ ...safe, updatedAt: nowIso() })
          .where(scope(eq(table.id, id)))
          .returning()) as TRow[]
        return rows[0]
      })
    },

    async softDelete(id) {
      assertCanWrite(ctx)
      return withTenant(db, ctx, async (tx) => {
        const rows = await tx
          .update(table)
          .set({ deletedAt: nowIso(), updatedAt: nowIso() })
          .where(scope(eq(table.id, id)))
          .returning({ id: table.id })
        return rows.length > 0
      })
    },

    async restore(id) {
      assertCanWrite(ctx)
      return withTenant(db, ctx, async (tx) => {
        // La restauration vise une ligne supprimée : le filtre standard l'exclurait.
        const rows = await tx
          .update(table)
          .set({ deletedAt: null, updatedAt: nowIso() })
          .where(and(eq(table.orgId, ctx.orgId), eq(table.id, id)))
          .returning({ id: table.id })
        return rows.length > 0
      })
    },
  }
}
