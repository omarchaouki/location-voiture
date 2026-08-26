import cron from 'node-cron'

import { getDb } from '~/db/client'
import { runAlertScan } from './alert-scan'
import { listLiveOrganizations, systemContext } from './system-context'

/**
 * Exécution périodique du moteur d'alertes — en développement.
 *
 * En production (Phase 12), c'est `pg_cron` qui appellera une Edge Function important
 * **exactement la même** `runAlertScan`. Ce fichier n'est que l'ordonnanceur : la
 * logique n'est pas ici, et c'est volontaire.
 *
 * Le balayage tourne toutes les heures et il est idempotent : le relancer ne crée
 * rien. Il peut donc être déclenché aussi souvent qu'on veut, y compris à la main
 * depuis le centre de notifications.
 */

let started = false

export async function scanAllOrganizations(): Promise<{ organizations: number; created: number }> {
  const db = getDb()
  const rows = await listLiveOrganizations(db)

  let created = 0
  for (const row of rows) {
    try {
      const result = await runAlertScan(db, systemContext(row.id, row.planCode))
      created += result.created
    } catch (error) {
      // Une organisation en erreur ne doit pas empêcher les autres d'être balayées.
      console.error(`[alertes] balayage échoué pour ${row.id}`, error)
    }
  }

  return { organizations: rows.length, created }
}

/** Démarre l'ordonnanceur une seule fois par processus. */
export function startAlertCron(): void {
  if (started) return
  started = true

  // Toutes les heures à la minute 5, pour ne pas tomber pile sur les autres tâches.
  cron.schedule('5 * * * *', () => {
    void scanAllOrganizations().then((result) => {
      console.warn(
        `[alertes] ${result.organizations} organisation(s) balayée(s), ${result.created} alerte(s) créée(s)`,
      )
    })
  })
}
