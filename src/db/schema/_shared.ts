import { sql } from 'drizzle-orm'
import { integer, text } from 'drizzle-orm/sqlite-core'

/**
 * Colonnes communes à toutes les tables — la charte de portabilité rendue exécutable.
 * Voir docs/DOMAIN.md §1 et docs/DECISIONS.md §4.
 *
 * Aucune de ces colonnes n'est facultative, et aucune table métier ne se crée sans
 * `orgColumns`. C'est la seule chose qui empêche une table d'échapper au cloisonnement.
 */

/** Clé primaire : UUID v4 généré par l'application. Jamais d'AUTOINCREMENT. */
export const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

/** Instant ISO 8601 UTC (`2026-08-22T09:15:00.000Z`). */
export const timestamp = (name: string) => text(name)

/** Date civile `YYYY-MM-DD` : une échéance administrative n'a pas d'heure. */
export const civilDate = (name: string) => text(name)

/** Booléen : `integer` 0/1, exposé en `boolean` par src/db/mappers. */
export const bool = (name: string) => integer(name, { mode: 'boolean' })

/** Argent : entier en centimes. Jamais de flottant, jamais de `real`. */
export const cents = (name: string) => integer(name)

export const nowIso = () => new Date().toISOString()

/** Horodatage commun. `deleted_at` non nul = ligne supprimée (soft delete). */
export const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => nowIso()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => nowIso())
    .$onUpdateFn(() => nowIso()),
  deletedAt: text('deleted_at'),
}

/**
 * La colonne la plus importante du projet : la frontière entre deux clients.
 *
 * Pas de contrainte de clé étrangère déclarée ici pour éviter une dépendance
 * circulaire entre modules de schéma ; l'intégrité est garantie par la couche
 * repository (aucune écriture sans `orgId` valide) puis, en Postgres, par le RLS.
 */
export const orgId = () => text('org_id').notNull()

/** Bloc à étaler dans chaque table métier. */
export const orgColumns = {
  id: id(),
  orgId: orgId(),
  ...timestamps,
}

/** Bloc pour les tables de plateforme, qui n'appartiennent à aucune organisation. */
export const platformColumns = {
  id: id(),
  ...timestamps,
}

/**
 * Prédicat des index uniques partiels : l'unicité ne porte que sur les lignes vivantes.
 * Une plaque libérée par un véhicule vendu doit pouvoir être ressaisie.
 *
 * SQLite et Postgres ont ici la même sémantique — c'est le seul fragment SQL du
 * schéma, isolé pour rester relisible au moment de la bascule.
 */
export const aliveOnly = sql`deleted_at is null`
