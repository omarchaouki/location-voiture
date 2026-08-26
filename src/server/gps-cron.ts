import cron from 'node-cron'

import { getDb } from '~/db/client'
import { resolveGpsProvider } from './gps/index'
import { syncGpsPositions } from './gps/sync'
import { purgeAllOrganizations } from './gps/retention'
import { can } from './plan'
import { listLiveOrganizations, systemContext } from './system-context'

/**
 * Relève périodique des positions — en développement.
 *
 * Même construction que l'ordonnanceur d'alertes, et pour les mêmes raisons : ce
 * fichier n'est QUE l'ordonnanceur. En production, c'est `pg_cron` qui appellera la
 * même `syncGpsPositions`, sans qu'une ligne de logique ait à être recopiée.
 *
 * Cadence de deux minutes, contre une heure pour les alertes : une carte qui date
 * d'une heure ne sert à rien, et deux minutes correspondent au pas d'échantillonnage
 * d'un boîtier ordinaire. Le travail est idempotent — le relancer ne crée rien —
 * donc la cadence est un réglage, pas un risque.
 */

let started = false

export interface GpsCronResult {
  organizations: number
  skipped: number
  inserted: number
  events: number
}

export async function syncAllOrganizations(): Promise<GpsCronResult> {
  const db = getDb()
  const provider = resolveGpsProvider()
  const rows = await listLiveOrganizations(db)

  const result: GpsCronResult = { organizations: 0, skipped: 0, inserted: 0, events: 0 }

  for (const row of rows) {
    const ctx = systemContext(row.id, row.planCode)

    // Le plan est vérifié ICI aussi, et pas seulement à l'écran : sans cela, une
    // organisation sans suivi GPS verrait quand même sa flotte relevée en fond.
    if (!(await can(ctx, 'gps.track', db))) {
      result.skipped += 1
      continue
    }

    try {
      const synced = await syncGpsPositions(db, ctx, provider)
      result.organizations += 1
      result.inserted += synced.inserted
      result.events += synced.geofenceEvents
    } catch (error) {
      // Une organisation en erreur ne doit pas arrêter la relève des autres.
      console.error(`[gps] relève échouée pour ${row.id}`, error)
    }
  }

  return result
}

/** Démarre l'ordonnanceur une seule fois par processus. */
export function startGpsCron(): void {
  if (started) return
  started = true

  /*
   * La purge tourne UNE fois par jour, à 3 h 17 — pas à 3 h 00 pile, où la moitié
   * des tâches nocturnes du monde se déclenchent en même temps.
   */
  cron.schedule('17 3 * * *', () => {
    void purgeAllOrganizations(getDb()).then((result) => {
      if (result.deleted > 0) {
        console.warn(
          `[gps] ${result.deleted} position(s) purgée(s) sur ${result.organizations} organisation(s)`,
        )
      }
    })
  })

  cron.schedule('*/2 * * * *', () => {
    void syncAllOrganizations().then((result) => {
      if (result.inserted > 0 || result.events > 0) {
        console.warn(
          `[gps] ${result.inserted} position(s), ${result.events} franchissement(s) sur ${result.organizations} organisation(s)`,
        )
      }
    })
  })
}
