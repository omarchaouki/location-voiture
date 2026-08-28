import { index, pgTable, text } from 'drizzle-orm/pg-core'

import { bool, civilDate, orgColumns, timestamp } from './_shared'

export const customers = pgTable(
  'customers',
  {
    ...orgColumns,
    /** individual | company */
    kind: text('kind').notNull().default('individual'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    companyName: text('company_name'),

    /** cin | passport | carte_sejour */
    idType: text('id_type'),
    idNumber: text('id_number'),

    licenceNumber: text('licence_number'),
    licenceIssuedOn: civilDate('licence_issued_on'),
    /** Bloquant à la signature une fois dépassée. docs/DOMAIN.md §6, invariant 5. */
    licenceExpiresOn: civilDate('licence_expires_on'),
    licenceCountry: text('licence_country').notNull().default('MA'),

    nationality: text('nationality'),
    birthOn: civilDate('birth_on'),

    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    city: text('city'),

    isBlacklisted: bool('is_blacklisted').notNull().default(false),
    blacklistReason: text('blacklist_reason'),
    blacklistAt: timestamp('blacklist_at'),

    notes: text('notes'),
  },
  (table) => [
    index('customers_org_idx').on(table.orgId, table.deletedAt),
    index('customers_licence_idx').on(table.orgId, table.licenceExpiresOn),
    index('customers_search_idx').on(table.orgId, table.lastName),
  ],
)

export const customerDocuments = pgTable(
  'customer_documents',
  {
    ...orgColumns,
    customerId: text('customer_id').notNull(),
    /** cin | passport | licence | other */
    kind: text('kind').notNull(),
    path: text('path').notNull(),
    expiresOn: civilDate('expires_on'),
  },
  (table) => [index('customer_documents_customer_idx').on(table.orgId, table.customerId)],
)
