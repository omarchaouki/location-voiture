/**
 * Recopie le greffon RTL dans `public/vendor/`.
 *
 *   pnpm vendor:rtl
 *
 * Le greffon est AUTO-HÉBERGÉ, jamais chargé depuis un CDN : il est fetché puis
 * évalué dans le worker de MapLibre, ce qui en fait un vecteur d'exécution de code.
 * Une CSP `worker-src 'self'` n'aurait aucun sens si le fichier venait d'ailleurs.
 * Voir docs/DECISIONS.md §2.4.
 *
 * Le nom porte la version : le fichier peut donc être servi en cache immuable, et
 * une montée de version se voit dans le diff au lieu de se glisser dedans.
 */

import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

/*
 * `exports` du paquet ne publie que `./src/index.js` (un module ESM qui importe le
 * wasm). Ce qu'il nous faut est le bundle `dist/`, celui que MapLibre sait charger
 * par fetch + eval. On résout donc le paquet par son `package.json`, atteint via
 * `require.resolve` sur le point d'entrée publié puis remontée de répertoire.
 */
const packageRoot = dirname(dirname(require.resolve('@mapbox/mapbox-gl-rtl-text')))
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  version: string
  main: string
}

const source = join(packageRoot, packageJson.main)
const target = join(process.cwd(), 'public', 'vendor', rtlTextFileName(packageJson.version))

mkdirSync(dirname(target), { recursive: true })
copyFileSync(source, target)

console.log(`greffon RTL ${packageJson.version} → ${target}`)

/** Une seule définition du nom, partagée avec le code applicatif et le test de dérive. */
export function rtlTextFileName(version: string): string {
  return `mapbox-gl-rtl-text-${version}.js`
}
