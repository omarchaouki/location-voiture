/**
 * Schéma complet. Un fichier par domaine, ce barillet pour drizzle-kit et le client.
 *
 * Rappel de la charte (docs/DOMAIN.md §1) : toute table métier porte
 * `id`, `org_id`, `created_at`, `updated_at`, `deleted_at`. Aucune exception.
 */

export * from './_shared'
export * from './auth'
export * from './platform'
export * from './billing'
export * from './vehicles'
export * from './customers'
export * from './contracts'
export * from './documents'
export * from './maintenance'
export * from './finance'
export * from './gps'
export * from './alerts'
