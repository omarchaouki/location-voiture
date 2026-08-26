import type { Db } from '~/db/client'

/**
 * COMPTEUR DE REQUÊTES.
 *
 * Le cahier des charges interdit les N+1 « dès le départ » et exige qu'un test
 * COMPTE les requêtes (docs/DOMAIN.md §7). Une interdiction qu'aucune machine ne
 * vérifie n'est pas une interdiction : elle tient tant que personne n'ajoute une
 * boucle, c'est-à-dire jusqu'au prochain écran.
 *
 * Ce que compte ce module, ce sont les EXÉCUTIONS, pas les préparations. Drizzle
 * réutilise ses instructions préparées : compter les `prepare()` laisserait passer
 * exactement le défaut qu'on cherche — la même requête jouée quarante fois.
 *
 * Aucune ligne de production n'est instrumentée. Le compteur s'accroche au client
 * `better-sqlite3` que Drizzle expose (`$client`), et se retire tout seul.
 */

interface Statement {
  all: (...args: unknown[]) => unknown
  get: (...args: unknown[]) => unknown
  run: (...args: unknown[]) => unknown
  [key: string]: unknown
}

interface SqliteClient {
  prepare: (sql: string) => Statement
}

export interface QueryCounter {
  /** SQL de chaque exécution, dans l'ordre. */
  readonly statements: ReadonlyArray<string>
  readonly count: number
  /** Exécutions dont le SQL contient un fragment — pour cibler une table. */
  matching(fragment: string): number
  reset(): void
  /** Rend au client son `prepare` d'origine. */
  stop(): void
}

/** Méthodes qui déclenchent réellement un aller-retour avec SQLite. */
const EXECUTING = new Set(['all', 'get', 'run', 'values'])

export function countQueries(db: Db): QueryCounter {
  const client = (db as unknown as { $client: SqliteClient }).$client
  const original = client.prepare.bind(client)
  const statements: string[] = []

  client.prepare = (sql: string): Statement => {
    const prepared = original(sql)

    /*
     * On enveloppe les méthodes d'EXÉCUTION, pas la préparation : c'est le nombre
     * d'allers-retours avec la base qui nous intéresse.
     *
     * Trois pièges, tous rencontrés pour de vrai avant que ce compteur ne compte
     * quoi que ce soit :
     *
     *  1. Une instruction `better-sqlite3` est un objet NATIF. Appelée avec le proxy
     *     pour `this`, elle lève « Illegal invocation » : chaque fonction est donc
     *     reliée à l'objet d'origine avant d'être renvoyée.
     *  2. `values` fait partie des méthodes d'exécution — c'est elle que Drizzle
     *     appelle pour un `select`. S'en tenir à `all`/`get`/`run` ne comptait rien.
     *  3. `raw()` et `pluck()` renvoient **l'instruction elle-même**. Renvoyée telle
     *     quelle, elle fait sortir l'appelant du proxy et la suite n'est plus vue.
     *     On remplace donc ce retour par le proxy. C'est ce troisième piège qui
     *     faisait afficher « 0 requête » à un compteur pourtant bien installé.
     */
    const proxy: Statement = new Proxy(prepared, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver) as unknown
        if (typeof value !== 'function') return value

        const bound = (value as (...inner: unknown[]) => unknown).bind(target)
        const counted = EXECUTING.has(String(property))

        return (...args: unknown[]) => {
          if (counted) statements.push(sql)
          const result = bound(...args)
          // `raw()`/`pluck()` renvoient `this` : on garde l'appelant dans le proxy.
          return result === target ? proxy : result
        }
      },
    })

    return proxy
  }

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
      client.prepare = original
    },
  }
}
