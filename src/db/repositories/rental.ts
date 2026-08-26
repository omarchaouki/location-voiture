import { desc, eq } from 'drizzle-orm'

import type { Db } from '../client'
import { contractPayments, contracts } from '../schema/contracts'
import { customers } from '../schema/customers'
import type { TenantContext } from '../tenant'
import { forOrg } from './base'

/**
 * Clients et contrats.
 *
 * Comme partout, tout passe par `forOrg` : aucune fonction n'accepte de requête sans
 * `TenantContext`, et ces tables entrent automatiquement dans le test de cloisonnement.
 */

export type CustomerRow = typeof customers.$inferSelect
export type ContractRow = typeof contracts.$inferSelect
export type ContractPaymentRow = typeof contractPayments.$inferSelect

export function customerRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<CustomerRow>(db, ctx, customers)

  return {
    ...base,

    /** Nom affichable : particulier ou société, jamais un identifiant nu. */
    label(row: CustomerRow): string {
      const person = [row.firstName, row.lastName].filter(Boolean).join(' ').trim()
      return person || (row.companyName ?? '').trim() || row.id
    },

    async search(term: string): Promise<CustomerRow[]> {
      const rows = await base.list()
      const needle = term.trim().toLowerCase()
      if (needle === '') return rows

      return rows.filter((row) =>
        [row.firstName, row.lastName, row.companyName, row.phone, row.idNumber]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(needle)),
      )
    },
  }
}

export function contractRepository(db: Db, ctx: TenantContext) {
  const base = forOrg<ContractRow>(db, ctx, contracts)
  const payments = forOrg<ContractPaymentRow>(db, ctx, contractPayments)

  return {
    ...base,
    payments,

    /** Contrats d'un véhicule, pour la détection de chevauchement et la frise. */
    async forVehicle(vehicleId: string): Promise<ContractRow[]> {
      return base.list(eq(contracts.vehicleId, vehicleId))
    },

    async forCustomer(customerId: string): Promise<ContractRow[]> {
      return base.list(eq(contracts.customerId, customerId))
    },

    /**
     * Dernière référence attribuée, pour calculer la suivante.
     *
     * La séquence doit rester continue par organisation : on lit le maximum plutôt
     * que de compter les lignes, sinon une suppression créerait un doublon.
     */
    async lastReference(): Promise<string | null> {
      const rows = await db
        .select({ reference: contracts.reference })
        .from(contracts)
        .where(eq(contracts.orgId, ctx.orgId))
        .orderBy(desc(contracts.reference))
        .limit(1)
      return rows[0]?.reference ?? null
    },
  }
}
