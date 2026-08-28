import { index, pgTable, text } from 'drizzle-orm/pg-core'

import { cents, civilDate, orgColumns } from './_shared'

/**
 * Dépenses et recettes rattachées au véhicule : c'est ce qui rend possible le coût
 * au kilomètre et la rentabilité par voiture.
 *
 * Un coût au kilomètre sans période affichée est un chiffre qui ne veut rien dire ;
 * la période est donc toujours explicite à l'écran (docs/DOMAIN.md §4.7).
 */

export const expenses = pgTable(
  'expenses',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id'),
    branchId: text('branch_id'),
    contractId: text('contract_id'),
    /** fuel | maintenance | insurance | road_tax | fine | cleaning | tyres | financing | admin | other */
    category: text('category').notNull(),
    amountCents: cents('amount_cents').notNull(),
    currency: text('currency').notNull().default('MAD'),
    spentOn: civilDate('spent_on').notNull(),
    supplier: text('supplier'),
    reference: text('reference'),
    note: text('note'),
    scanPath: text('scan_path'),
  },
  (table) => [
    index('expenses_vehicle_idx').on(table.orgId, table.vehicleId, table.spentOn),
    index('expenses_category_idx').on(table.orgId, table.category, table.spentOn),
  ],
)

export const revenues = pgTable(
  'revenues',
  {
    ...orgColumns,
    vehicleId: text('vehicle_id'),
    contractId: text('contract_id'),
    /** rental | extras | deposit_withheld | fine_rebill | sale | other */
    category: text('category').notNull(),
    amountCents: cents('amount_cents').notNull(),
    currency: text('currency').notNull().default('MAD'),
    receivedOn: civilDate('received_on').notNull(),
    method: text('method'),
    note: text('note'),
  },
  (table) => [
    index('revenues_vehicle_idx').on(table.orgId, table.vehicleId, table.receivedOn),
    index('revenues_category_idx').on(table.orgId, table.category, table.receivedOn),
  ],
)
