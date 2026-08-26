import { createMockProvider } from './mock'
import type { GpsProvider } from './provider'
import { createTraccarProvider } from './traccar'

export * from './provider'
export { createMockProvider, MOCK_CENTER, mockPositionAt } from './mock'
export { createTraccarProvider, knotsToKmh } from './traccar'

/**
 * Choix du fournisseur, au démarrage et à un seul endroit.
 *
 * `GPS_PROVIDER=traccar` sans `TRACCAR_URL` ni `TRACCAR_TOKEN` ne bascule PAS
 * silencieusement sur le simulateur : ce serait la pire des issues — une flotte qui
 * semble suivie alors qu'elle ne l'est pas. On lève, et le démarrage échoue.
 *
 * Limite assumée de la Phase 7 : la configuration est celle du DÉPLOIEMENT, pas de
 * l'organisation. Une instance Traccar par client demanderait de stocker une URL et
 * un jeton par organisation, donc un secret en base et son chiffrement — c'est le
 * sujet de la phase des paramètres, pas de celle-ci. Consigné dans docs/AUDIT.md.
 */
export function resolveGpsProvider(env: NodeJS.ProcessEnv = process.env): GpsProvider {
  const name = env['GPS_PROVIDER'] ?? 'mock'

  if (name === 'traccar') {
    const url = env['TRACCAR_URL']
    const token = env['TRACCAR_TOKEN']
    if (!url || !token) {
      throw new Error('GPS_PROVIDER=traccar exige TRACCAR_URL et TRACCAR_TOKEN')
    }
    return createTraccarProvider({ url, token })
  }

  return createMockProvider()
}
