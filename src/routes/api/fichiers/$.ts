import { createFileRoute } from '@tanstack/react-router'

import { requireTenant } from '~/auth/context'
import { getStorage, keyBelongsTo } from '~/server/storage'

/**
 * SERVICE DES FICHIERS — `/api/fichiers/org/<orgId>/…`.
 *
 * Les images du produit ne sont pas publiques. Un logo d'agence, une vignette de
 * voiture, demain un scan de carte grise : rien de tout cela ne doit s'ouvrir pour qui
 * devine une adresse. Chaque octet passe donc par ici, et par ici seulement.
 *
 * **Le cloisonnement tient en deux lignes, et dans cet ordre.** La session donne le
 * `orgId` — jamais l'URL, jamais un en-tête —, puis la clé demandée est comparée à ce
 * `orgId`. Une clé d'une autre organisation rend **404 et non 403** : c'est la règle du
 * produit, un 403 confirmerait que le fichier existe.
 *
 * `Cache-Control: private` est ce qui empêche un cache partagé — un proxy d'entreprise,
 * un CDN mal réglé — de garder la vignette d'une agence et de la resservir à une autre.
 * `immutable` va avec le fait que les clés sont des UUID : un fichier ne change jamais
 * de contenu sous la même clé, une image remplacée reçoit une clé neuve.
 */
export const Route = createFileRoute('/api/fichiers/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let tenant
        try {
          tenant = await requireTenant(request.headers)
        } catch {
          // Pas de session utilisable : rien à voir ici, et surtout pas de redirection
          // vers la connexion — c'est une balise `<img>` qui appelle, pas un onglet.
          return new Response(null, { status: 404 })
        }

        const { pathname } = new URL(request.url)
        const key = decodeURIComponent(pathname.replace(/^\/api\/fichiers\//, ''))
        if (!keyBelongsTo(key, tenant.orgId)) return new Response(null, { status: 404 })

        const file = await getStorage().get(key)
        if (!file) return new Response(null, { status: 404 })

        return new Response(file.bytes as unknown as BodyInit, {
          headers: {
            'content-type': file.contentType,
            'content-length': String(file.bytes.byteLength),
            'cache-control': 'private, max-age=31536000, immutable',
          },
        })
      },
    },
  },
})
