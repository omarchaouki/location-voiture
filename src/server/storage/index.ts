import { createLocalStorage } from './local'
import type { StorageProvider } from './provider'
import { createSupabaseStorage } from './supabase'

export * from './provider'
export { createLocalStorage } from './local'
export { createSupabaseStorage } from './supabase'

/**
 * Choix du fournisseur de stockage, au premier usage et à un seul endroit.
 *
 * Même règle que pour le GPS (`src/server/gps/index.ts`) : `STORAGE_PROVIDER=supabase`
 * sans URL ni clé ne retombe PAS silencieusement sur le disque local. Ce serait la
 * pire des issues — une agence croirait ses scans partis chez l'hébergeur alors qu'ils
 * dorment sur une machine qui sera remplacée au prochain déploiement. On lève.
 *
 * Le nom du seau est fixe (`flotta`) et non paramétrable : un seau se crée une fois,
 * à la main, et une variable de plus n'est qu'une occasion supplémentaire d'écrire
 * deux noms différents entre la mise en recette et la production.
 */
export function resolveStorageProvider(env: NodeJS.ProcessEnv = process.env): StorageProvider {
  const name = env['STORAGE_PROVIDER'] ?? 'local'

  if (name === 'supabase') {
    const url = env['SUPABASE_URL']
    const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY']
    if (!url || !serviceRoleKey) {
      throw new Error('STORAGE_PROVIDER=supabase exige SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY')
    }
    return createSupabaseStorage({ url, serviceRoleKey, bucket: 'flotta' })
  }

  return createLocalStorage(env['STORAGE_LOCAL_DIR'] ?? './data/uploads')
}

/**
 * Singleton paresseux.
 *
 * Paresseux et non construit à l'import : le fournisseur lève quand sa configuration
 * est incomplète, et le faire à l'import ferait échouer le simple chargement d'un
 * module par un test qui ne stocke rien.
 */
let provider: StorageProvider | null = null

export function getStorage(): StorageProvider {
  provider ??= resolveStorageProvider()
  return provider
}

/** Remet le singleton à zéro. Réservé aux tests, qui changent d'environnement. */
export function resetStorage(): void {
  provider = null
}
