import { setQuerySink } from './db'

/**
 * COMPTEUR DE REQUÊTES.
 *
 * Le cahier des charges interdit les N+1 « dès le départ » et exige qu'un test COMPTE
 * les requêtes (docs/DOMAIN.md §7). Une interdiction qu'aucune machine ne vérifie n'est
 * pas une interdiction : elle tient tant que personne n'ajoute une boucle, c'est-à-dire
 * jusqu'au prochain écran.
 *
 * **Il compte les EXÉCUTIONS, pas les préparations.** Drizzle réutilise ses instructions
 * préparées : compter les préparations laisserait passer exactement le défaut qu'on
 * cherche — la même requête jouée quarante fois.
 *
 * La version précédente s'accrochait au `prepare()` de `better-sqlite3` par un Proxy, et
 * portait trois commentaires sur les pièges des objets natifs. Tout cela a disparu avec
 * la bascule Postgres : Drizzle expose un JOURNAL, appelé une fois par exécution réelle,
 * dans tous les pilotes. Le compteur ne connaît plus le pilote — donc il ne cassera plus
 * en changeant de base.
 *
 * Aucune ligne de production n'est instrumentée : le journal est posé par la fabrique de
 * bases de test (tests/helpers/db.ts).
 */

export interface QueryCounter {
  /** SQL de chaque exécution, dans l'ordre. */
  readonly statements: ReadonlyArray<string>
  readonly count: number
  /** Exécutions dont le SQL contient un fragment — pour cibler une table. */
  matching(fragment: string): number
  reset(): void
  /** Débranche le compteur. */
  stop(): void
}

export function countQueries(): QueryCounter {
  const statements: string[] = []
  setQuerySink((sql) => statements.push(sql))

  return {
    get statements() {
      return statements
    },
    get count() {
      return statements.length
    },
    matching(fragment) {
      const needle = fragment.toLowerCase()
      return statements.filter((sql) => sql.toLowerCase().includes(needle)).length
    },
    reset() {
      statements.length = 0
    },
    stop() {
      setQuerySink(undefined)
    },
  }
}
