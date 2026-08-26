import cron from 'node-cron'

import { getDb } from '~/db/client'
import { businessCivilDate, businessParts } from '~/i18n/format'
import { resetAllDemoOrganizations } from './demo/reset'

/**
 * Réinitialisation nocturne des espaces de démonstration.
 *
 * **Le piège de l'heure locale, et pourquoi ce cron ne ressemble pas aux autres.**
 *
 * `node-cron` planifie sur l'heure du SERVEUR. Or l'heure voulue est celle de
 * Casablanca (`DEMO_RESET_HOUR_LOCAL`, 3 h par défaut), et `Africa/Casablanca`
 * change d'offset deux fois par an — il repasse à UTC+0 pendant le Ramadan
 * (docs/DECISIONS.md É7). Un `cron.schedule('0 3 * * *')` posé sur un serveur en UTC
 * réinitialiserait à 4 h locales une partie de l'année et à 3 h le reste : une heure
 * de décalage qui, une nuit sur deux, tombe pendant qu'un visiteur regarde la démo.
 *
 * On ne calcule donc AUCUN offset. Le cron s'exécute toutes les heures et demande à
 * `businessParts()` quelle heure il est réellement à Casablanca. C'est plus lent et
 * infiniment plus sûr : la question « quelle heure est-il là-bas ? » n'a qu'une
 * réponse juste, et ce n'est jamais une soustraction.
 */

let started = false

export function shouldResetNow(now: Date, targetHour: number): boolean {
  return businessParts(now).hour === targetHour
}

export function resetHourFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env['DEMO_RESET_HOUR_LOCAL'] ?? 3)
  return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : 3
}

export function startDemoCron(): void {
  if (started) return
  started = true

  const targetHour = resetHourFromEnv()

  // Toutes les heures à la minute 40 : on regarde l'heure de Casablanca, pas celle
  // du serveur. Les autres tâches tournent aux minutes 5, 12 et 17 — on ne se
  // dispute pas la base avec elles.
  cron.schedule('40 * * * *', () => {
    const now = new Date()
    if (!shouldResetNow(now, targetHour)) return

    void resetAllDemoOrganizations(getDb(), businessCivilDate(now)).then((result) => {
      if (result.organizations > 0) {
        console.warn(`[démo] ${result.organizations} espace(s) réinitialisé(s)`)
      }
    })
  })
}
