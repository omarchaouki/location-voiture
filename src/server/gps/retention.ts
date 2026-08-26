import type { Db } from '~/db/client'
import { gpsPositionRepository } from '~/db/repositories/gps'
import type { TenantContext } from '~/db/tenant'
import { listLiveOrganizations, systemContext } from '../system-context'

/**
 * RÉTENTION des positions GPS.
 *
 * `gps_positions` est la seule table du produit dont la taille croît toute seule :
 * une voiture équipée envoie de l'ordre de 3 000 points par jour, soit un million par
 * an et par voiture. Une flotte de quarante voitures dépasse 40 millions de lignes la
 * première année — sur SQLite, la base devient inexploitable bien avant.
 *
 * `docs/DOMAIN.md` §4.8 annonçait « une rétention par défaut de 12 mois configurable
 * par plan ». Elle était annoncée et non écrite : la voici.
 *
 * Ce qui est purgé et ce qui ne l'est PAS :
 *  - les positions, oui — ce sont des mesures ;
 *  - les événements de zone, les kilomètres portés au compteur du véhicule et les
 *    alertes, **jamais**. Ce sont les faits de gestion qui en ont été tirés, ils sont
 *    minuscules, et ce sont eux qu'on relit un an plus tard en cas de litige.
 *
 * Autrement dit : on jette la matière première, on garde ce qu'on en a conclu.
 */

/** Douze mois, la valeur annoncée dans DOMAIN.md §4.8. */
export const DEFAULT_RETENTION_DAYS = 365

/** Plancher de sécurité : personne ne doit pouvoir purger la semaine en cours. */
const MIN_RETENTION_DAYS = 30

export interface PurgeResult {
  organizations: number
  deleted: number
}

export async function purgeGpsPositions(
  db: Db,
  ctx: TenantContext,
  options: { retentionDays?: number; now?: Date } = {},
): Promise<number> {
  const days = Math.max(MIN_RETENTION_DAYS, options.retentionDays ?? DEFAULT_RETENTION_DAYS)
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - days * 24 * 3_600_000).toISOString()

  return gpsPositionRepository(db, ctx).purgeOlderThan(cutoff)
}

/**
 * Purge de toutes les organisations.
 *
 * Appelée une fois par jour par l'ordonnanceur (`src/server/gps-cron.ts`). En
 * production ce sera `pg_cron` appelant la même fonction — et le jour où
 * `gps_positions` sera partitionnée par mois en Postgres, la purge deviendra un
 * `DROP PARTITION`, instantané au lieu d'un `DELETE` de plusieurs millions de lignes.
 * C'est pour cela que la coupure est une DATE et non une liste d'identifiants.
 */
export async function purgeAllOrganizations(
  db: Db,
  options: { retentionDays?: number; now?: Date } = {},
): Promise<PurgeResult> {
  const rows = await listLiveOrganizations(db)
  const result: PurgeResult = { organizations: 0, deleted: 0 }

  for (const row of rows) {
    try {
      const deleted = await purgeGpsPositions(db, systemContext(row.id, row.planCode), options)
      result.organizations += 1
      result.deleted += deleted
    } catch (error) {
      // Une organisation en erreur ne doit pas empêcher les autres d'être purgées.
      console.error(`[gps] purge échouée pour ${row.id}`, error)
    }
  }

  return result
}
