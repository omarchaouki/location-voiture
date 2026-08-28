import { sql } from 'drizzle-orm'
import { boolean, integer, text } from 'drizzle-orm/pg-core'

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

/**
 * Instant ISO 8601 UTC (`2026-08-22T09:15:00.000Z`), stocké en `text`.
 *
 * Postgres a un `timestamptz` natif, et on ne s'en sert PAS pour les tables métier.
 * Ce n'est pas de la timidité : tout le produit compare et trie ces instants comme des
 * chaînes, et `businessCivilDate()` les découpe à la main pour tenir compte du passage
 * du Maroc à UTC+0 pendant le Ramadan. Changer de type ferait remonter des `Date` là où
 * le code attend des chaînes, dans les 54 tables d'un coup, pour un gain nul.
 *
 * Les chaînes sont normalisées en `Z` avec millisecondes : le tri lexicographique est
 * alors exactement le tri chronologique.
 */
export const timestamp = (name: string) => text(name)

/** Date civile `YYYY-MM-DD` : une échéance administrative n'a pas d'heure. */
export const civilDate = (name: string) => text(name)

/**
 * Booléen — `boolean` NATIF, et c'est l'un des deux seuls changements de type de la
 * bascule Postgres (28/08/2026).
 *
 * En SQLite c'était un `integer` 0/1 exposé en booléen par Drizzle, faute de type
 * dédié. Postgres en a un ; garder l'entier serait porter une prothèse qui n'a plus de
 * jambe cassée à soutenir. Côté application le type TypeScript est identique : aucun
 * appelant ne change.
 */
export const bool = (name: string) => boolean(name)

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
 * repository (aucune écriture sans `orgId` valide) puis, quand il sera écrit, par le
 * RLS — qui reste à faire.
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
 * schéma, et il a traversé la bascule sans une modification.
 */
export const aliveOnly = sql`deleted_at is null`
