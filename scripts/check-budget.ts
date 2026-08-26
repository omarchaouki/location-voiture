/**
 * BUDGET DE POIDS du paquet client.
 *
 *   pnpm build && pnpm check:budget
 *
 * Pourquoi un script et pas une bonne intention : le poids d'un front ne se dégrade
 * jamais d'un coup. Il prend quinze kilo-octets par phase, personne ne le remarque, et
 * deux ans plus tard le produit met six secondes à s'afficher sur la 3G d'un gérant en
 * déplacement. Le seul remède est un chiffre qui échoue.
 *
 * Trois garde-fous, et le troisième est le plus utile :
 *  1. le paquet d'ENTRÉE — celui que tout le monde télécharge avant de voir quoi que
 *     ce soit ;
 *  2. la feuille de style, même raison ;
 *  3. **tout morceau lourd doit être déclaré ici.** Un fond de carte, un éditeur de
 *     texte, une bibliothèque de graphiques entrent un jour dans un projet ; ils
 *     doivent entrer en le disant, avec la raison écrite à côté.
 *
 * Les tailles comparées sont en gzip : c'est ce qui passe sur le réseau.
 */

import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS = join(process.cwd(), 'dist', 'client', 'assets')

/** Kilo-octets gzip. Relevés le 24/08/2026, marge d'environ 15 %. */
const BUDGETS = {
  entry: 150,
  css: 30,
  /** Au-delà, un morceau doit figurer dans `HEAVY_BY_DESIGN`. */
  chunk: 120,
}

/**
 * Morceaux lourds ASSUMÉS, avec leur raison.
 *
 * Chargés paresseusement : ils ne pèsent que sur l'écran qui les demande. Ajouter une
 * ligne ici est une décision, et elle se relit en revue de code.
 */
const HEAVY_BY_DESIGN: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /^maplibre-gl-/,
    reason: 'moteur de carte, chargé seulement sur les écrans qui en portent une',
  },
]

interface Asset {
  name: string
  gzipKb: number
}

/**
 * CODE SERVEUR INTERDIT DANS LE PAQUET CLIENT.
 *
 * Le 25/08/2026, une fonction exportée d'un module de server functions a traîné
 * `~/db/client` — donc `better-sqlite3` — jusque dans le navigateur. Le pilote natif
 * lève « promisify is not a function » à l'évaluation, React ne s'hydrate pas, et
 * **toute l'application cesse de répondre sans message d'erreur visible**. Le
 * formulaire de connexion est reparti en soumission native, plaçant l'adresse et le
 * mot de passe dans l'URL.
 *
 * Le coût était donc double : l'application morte, et une fuite d'identifiants. Rien
 * ne l'avait signalé — ni le typage, ni le lint, ni les 424 tests, qui s'exécutent
 * tous côté serveur. D'où ce contrôle : il regarde ce qui est RÉELLEMENT livré au
 * navigateur.
 */
const SERVER_ONLY_MARKERS: ReadonlyArray<{ needle: string; what: string }> = [
  { needle: 'better-sqlite3', what: 'le pilote SQLite natif' },
  { needle: 'foreign_keys = ON', what: 'src/db/client.ts (pragmas de connexion)' },
  { needle: 'node-cron', what: 'l’ordonnanceur' },
  { needle: 'node:fs', what: 'un module Node' },
  { needle: 'node:crypto', what: 'un module Node (condensé des adresses IP)' },
]

/*
 * Ce que ce contrôle NE cherche PAS, et pourquoi.
 *
 * Première version : le nom `AUTH_SECRET`. Il ressort à chaque fois — Better Auth
 * embarque un accesseur qui lit `process.env.AUTH_SECRET` au moment de l'exécution,
 * et ce nom se retrouve donc légitimement dans le paquet client, sans la moindre
 * valeur. Un contrôle qui crie au loup à chaque construction est un contrôle qu'on
 * désactive au bout de deux semaines. On s'en tient donc à ce qu'il peut PROUVER :
 * la présence de modules qui n'ont rien à faire dans un navigateur.
 */

function gzipKb(path: string): number {
  return Math.round((gzipSync(readFileSync(path)).length / 1024) * 10) / 10
}

function read(extension: string): Asset[] {
  return readdirSync(ASSETS)
    .filter((name) => name.endsWith(extension))
    .map((name) => ({ name, gzipKb: gzipKb(join(ASSETS, name)) }))
    .sort((a, b) => b.gzipKb - a.gzipKb)
}

let failed = false

function check(label: string, actual: number, budget: number): void {
  const verdict = actual <= budget ? 'OK  ' : 'DÉPASSÉ'
  if (actual > budget) failed = true
  console.log(`  ${verdict}  ${label.padEnd(34)} ${String(actual).padStart(7)} ko  (budget ${budget})`)
}

const scripts = read('.js')
const styles = read('.css')

/* Ce contrôle passe AVANT les budgets : un paquet client qui embarque le serveur est
   un problème d'une autre nature qu'un paquet trop lourd. */
console.log('Code serveur dans le paquet client\n')
for (const { needle, what } of SERVER_ONLY_MARKERS) {
  const guilty = scripts.filter((asset) =>
    readFileSync(join(ASSETS, asset.name), 'utf8').includes(needle),
  )
  if (guilty.length === 0) {
    console.log(`  OK      ${needle.padEnd(24)} absent`)
    continue
  }
  failed = true
  console.log(`  INTERDIT  ${needle.padEnd(22)} ${what} — dans ${guilty.map((a) => a.name).join(', ')}`)
}
console.log('')

// L'entrée porte le routeur et le socle : c'est elle que tout le monde télécharge.
const entry = scripts.find((asset) => /^index-/.test(asset.name))
if (!entry) {
  console.error('Paquet d’entrée introuvable dans dist/client/assets — lancer `pnpm build` d’abord.')
  process.exit(1)
}

console.log('Poids du paquet client (gzip)\n')
check('paquet d’entrée', entry.gzipKb, BUDGETS.entry)
check(
  'feuilles de style',
  Math.round(styles.reduce((total, asset) => total + asset.gzipKb, 0) * 10) / 10,
  BUDGETS.css,
)

const undeclared = scripts.filter(
  (asset) =>
    asset.gzipKb > BUDGETS.chunk &&
    asset !== entry &&
    !HEAVY_BY_DESIGN.some((allowed) => allowed.pattern.test(asset.name)),
)

for (const asset of undeclared) {
  failed = true
  console.log(
    `  DÉPASSÉ  ${asset.name.padEnd(34)} ${String(asset.gzipKb).padStart(7)} ko  (morceau non déclaré)`,
  )
}

console.log('\nMorceaux les plus lourds :')
for (const asset of scripts.slice(0, 5)) {
  const declared = HEAVY_BY_DESIGN.find((allowed) => allowed.pattern.test(asset.name))
  console.log(
    `  ${String(asset.gzipKb).padStart(7)} ko  ${asset.name}${declared ? `  — ${declared.reason}` : ''}`,
  )
}

if (failed) {
  console.log('\nBudget dépassé. Alléger, ou déclarer le morceau avec sa raison dans ce fichier.')
  process.exit(1)
}

console.log('\nTous les budgets sont tenus.')
