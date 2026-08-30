import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'

import { contentTypeOf, type StorageProvider, type StoredFile } from './provider'

/**
 * STOCKAGE LOCAL — des fichiers sur le disque de la machine qui sert l'application.
 *
 * C'est le fournisseur du développement et du premier déploiement Lightsail : il ne
 * demande ni compte, ni clé, ni réseau, et il se sauvegarde avec le reste du volume.
 * Sa limite est connue et assumée — deux machines derrière un répartiteur ne
 * partagent pas ce dossier. Le jour où il en faudra deux, `STORAGE_PROVIDER=supabase`
 * suffit : c'est exactement pour cela que l'interface existe.
 *
 * **La clé est traduite en chemin, donc elle est vérifiée.** `resolve()` déplie les
 * `..` ; on compare ensuite le chemin obtenu au dossier racine. Sans ce contrôle,
 * une clé forgée sortirait du dossier des téléversements et lirait n'importe quel
 * fichier de la machine — la variable d'environnement du serveur comprise.
 */
export function createLocalStorage(directory: string): StorageProvider {
  const root = resolve(directory)

  /** Chemin absolu d'une clé, ou `null` si elle sort du dossier racine. */
  function pathOf(key: string): string | null {
    const target = resolve(join(root, key))
    return target === root || target.startsWith(root + sep) ? target : null
  }

  return {
    name: 'local',

    async put(key, file) {
      const target = pathOf(key)
      if (!target) throw new Error('invalid storage key')

      // `recursive` crée `org/<id>/logo` d'un coup : le premier fichier d'une agence
      // arrive avant que le moindre dossier n'existe.
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, file.bytes)
    },

    async get(key) {
      const target = pathOf(key)
      if (!target) return null

      try {
        const bytes = await readFile(target)
        return { bytes, contentType: contentTypeOf(key) } satisfies StoredFile
      } catch {
        /*
         * Absent = `null`, jamais une exception.
         *
         * Un fichier effacé à la main sur le serveur, ou une base restaurée sans son
         * volume, ne doit pas faire tomber la fiche véhicule qui le référence : elle
         * s'affiche sans image, ce qui est un défaut visible et réparable.
         */
        return null
      }
    },

    async remove(key) {
      const target = pathOf(key)
      if (!target) return
      await rm(target, { force: true })
    },
  }
}
