import cron from 'node-cron'

import { getDb } from '~/db/client'
import { applySubscriptionStatus } from './billing-admin'
import { listLiveOrganizations } from './system-context'

/**
 * Cycle de vie des abonnements — une fois par jour.
 *
 * Sans ce balayage, `effectiveStatus` ne serait qu'une fonction pure que personne
 * n'appelle : une organisation impayée resterait `active` en base, et
 * `requireTenant` continuerait de l'autoriser à écrire indéfiniment. C'est ce fichier
 * qui rend la règle vraie.
 *
 * Une fois par jour suffit — le cycle se compte en jours, pas en minutes — et à 4 h 12,
 * après la purge GPS, pour ne pas se disputer la base avec elle.
 *
 * Idempotent : recalculer le même jour donne le même statut et n'écrit que si quelque
 * chose a changé.
 */

let started = false

export interface BillingScanResult {
  organizations: number
  changed: number
}

export async function refreshAllSubscriptions(): Promise<BillingScanResult> {
  const db = getDb()
  const rows = await listLiveOrganizations(db)
  const result: BillingScanResult = { organizations: rows.length, changed: 0 }

  for (const row of rows) {
    try {
      const before = row.planCode
      const status = await applySubscriptionStatus(db, row.id)
      // `applySubscriptionStatus` n'écrit que sur changement ; on compte les bascules
      // vers un état qui bloque l'écriture, celles qui se voient chez le client.
      if (status === 'read_only' || status === 'past_due') result.changed += 1
      void before
    } catch (error) {
      // Une organisation en erreur ne doit pas empêcher les autres d'être calculées.
      console.error(`[abonnement] recalcul échoué pour ${row.id}`, error)
    }
  }

  return result
}

export function startBillingCron(): void {
  if (started) return
  started = true

  cron.schedule('12 4 * * *', () => {
    void refreshAllSubscriptions().then((result) => {
      if (result.changed > 0) {
        console.warn(
          `[abonnement] ${result.changed} organisation(s) en impayé ou lecture seule sur ${result.organizations}`,
        )
      }
    })
  })
}
