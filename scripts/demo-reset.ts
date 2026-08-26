/**
 * Remet les espaces de démonstration à zéro.
 *
 *   pnpm demo:reset
 *
 * Même chemin que la réinitialisation nocturne (`src/server/demo-cron.ts`) : la
 * commande manuelle et la tâche automatique appellent la MÊME fonction. Deux chemins
 * auraient fini par diverger, et la démo se serait mise à différer selon l'heure.
 */

import { createDb, resolveDatabaseFile } from '~/db/client'
import { resetAllDemoOrganizations } from '~/server/demo/reset'
import { businessCivilDate } from '~/i18n/format'

const db = createDb(resolveDatabaseFile())
const today = businessCivilDate(new Date())
const result = await resetAllDemoOrganizations(db, today)

if (result.organizations === 0) {
  console.log('Aucun espace de démonstration. Lancer `pnpm seed` pour les créer.')
} else {
  console.log(`${result.organizations} espace(s) réinitialisé(s) au ${today}.`)
}
