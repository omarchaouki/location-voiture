/**
 * ENTRÉE DE PRODUCTION — `pnpm start`.
 *
 * `vite build` ne produit PAS un serveur : `dist/server/server.js` exporte un objet
 * `{ fetch }`, c'est-à-dire un gestionnaire de requêtes au format Web, sans rien qui
 * écoute un port. Le `pnpm start` d'avant (`node dist/server/server.js`) chargeait donc
 * le module et rendait la main aussitôt, sans un mot — un serveur qui « démarre » en
 * 40 ms et laisse le port fermé. C'est ce fichier qui manquait.
 *
 * `srvx` fait l'adaptation `Request`/`Response` ↔ `node:http`. Ce n'est pas une
 * dépendance de confort : le rendu SSR est envoyé en FLUX, et une adaptation écrite à la
 * main qui attendrait la fin de la réponse annulerait le streaming — la page arriverait
 * d'un bloc, après le dernier octet.
 */

import { createReadStream, statSync } from 'node:fs'
import { join, normalize, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'

import { serve } from 'srvx'

import app from './dist/server/server.js'

const PORT = Number(process.env['PORT'] ?? 3000)
/*
 * La boucle locale par défaut. Derrière nginx c'est le bon comportement, et l'oubli
 * inverse — écouter sur 0.0.0.0 — exposerait le processus en clair sur Internet, à côté
 * du TLS au lieu d'être derrière.
 */
const HOST = process.env['HOST'] ?? '127.0.0.1'

const CLIENT_DIR = resolve('dist/client')

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

/**
 * Fichiers du build client.
 *
 * En production réelle c'est nginx qui les sert depuis le disque, sans passer par Node.
 * Les servir AUSSI ici n'est pas de la redondance inutile : c'est ce qui permet de
 * vérifier un build en lançant `pnpm start` seul, avant qu'aucun proxy n'existe — et le
 * premier déploiement se fait précisément dans cet ordre.
 */
function serveStatic(pathname) {
  if (!pathname.startsWith('/assets/') && !pathname.startsWith('/vendor/')) return null

  /*
   * `normalize` PUIS vérification du préfixe : sans ça, `/assets/../../etc/passwd`
   * sortirait du répertoire. Comparer les chaînes avant de normaliser ne sert à rien —
   * c'est la forme normalisée qui décide de ce que le système ouvrira.
   */
  const target = resolve(join(CLIENT_DIR, normalize(decodeURIComponent(pathname))))
  if (target !== CLIENT_DIR && !target.startsWith(CLIENT_DIR + sep)) return null

  let stats
  try {
    stats = statSync(target)
  } catch {
    return null
  }
  if (!stats.isFile()) return null

  const extension = target.slice(target.lastIndexOf('.'))
  const headers = {
    'content-type': MIME[extension] ?? 'application/octet-stream',
    'content-length': String(stats.size),
  }

  // Les noms portent une empreinte de contenu : le fichier ne changera jamais sous ce
  // nom-là. `/vendor/` est versionné dans son nom aussi (…-0.4.0.js).
  headers['cache-control'] = 'public, max-age=31536000, immutable'

  return new Response(Readable.toWeb(createReadStream(target)), { headers })
}

serve({
  port: PORT,
  hostname: HOST,
  fetch(request) {
    const { pathname } = new URL(request.url)
    if (request.method === 'GET' || request.method === 'HEAD') {
      const asset = serveStatic(pathname)
      if (asset) return asset
    }
    return app.fetch(request)
  },
})

console.log(`Flotta écoute sur http://${HOST}:${PORT}`)
