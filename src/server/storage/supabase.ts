import { contentTypeOf, type StorageProvider, type StoredFile } from './provider'

/**
 * STOCKAGE SUPABASE — l'API REST du service Storage, appelée par `fetch`.
 *
 * Aucun paquet ajouté. `@supabase/supabase-js` pèse une centaine de kilo-octets et
 * apporte l'authentification, le temps réel et PostgREST, dont ce produit n'utilise
 * rien : il parle à Postgres par Drizzle et gère ses sessions par Better Auth. Trois
 * appels HTTP se lisent mieux qu'une dépendance qu'il faudra suivre.
 *
 * **La clé de service contourne le RLS**, par conception : elle voit tous les
 * fichiers de toutes les organisations. C'est donc le cloisonnement de NOTRE côté qui
 * protège — `keyBelongsTo`, vérifié par la route de service avant le moindre appel.
 * Cette clé ne sort jamais du serveur, et n'a rien à faire dans une variable préfixée
 * `VITE_`.
 *
 * Le seau est PRIVÉ : le produit sert les octets lui-même plutôt que de distribuer des
 * URL signées. Une URL signée qui fuit reste valable jusqu'à son expiration, et un
 * contrat scanné n'a pas à être lisible par qui retrouve un lien dans un historique.
 */
export function createSupabaseStorage(options: {
  url: string
  serviceRoleKey: string
  bucket: string
}): StorageProvider {
  const base = `${options.url.replace(/\/$/, '')}/storage/v1/object`
  const headers = {
    authorization: `Bearer ${options.serviceRoleKey}`,
    apikey: options.serviceRoleKey,
  }

  return {
    name: 'supabase',

    async put(key, file) {
      const response = await fetch(`${base}/${options.bucket}/${key}`, {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': file.contentType,
          // Remplace au lieu de refuser : un logo re-téléversé sur la même clé ne doit
          // pas échouer en 409. Les clés sont des UUID, donc la collision est un
          // remplacement voulu, jamais un accident.
          'x-upsert': 'true',
        },
        body: file.bytes as unknown as BodyInit,
      })

      if (!response.ok) {
        throw new Error(`supabase storage put failed: ${response.status}`)
      }
    },

    async get(key) {
      const response = await fetch(`${base}/${options.bucket}/${key}`, { headers })
      // 404 compris : un fichier absent rend `null`, comme en local — la fiche
      // s'affiche sans image plutôt que de tomber.
      if (!response.ok) return null

      const bytes = new Uint8Array(await response.arrayBuffer())
      return {
        bytes,
        // Le type vient de la CLÉ et non de l'en-tête : Supabase renvoie parfois
        // `application/octet-stream` pour un fichier posé sans type, et le navigateur
        // proposerait alors de télécharger une image au lieu de l'afficher.
        contentType: contentTypeOf(key),
      } satisfies StoredFile
    },

    async remove(key) {
      await fetch(`${base}/${options.bucket}/${key}`, { method: 'DELETE', headers })
    },
  }
}
