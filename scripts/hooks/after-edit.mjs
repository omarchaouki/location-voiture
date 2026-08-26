/**
 * Hook PostToolUse : vérifie le fichier qui vient d'être écrit.
 *
 * Lancé par `.claude/settings.json` après Write/Edit. Reçoit la charge utile du
 * hook sur stdin (`jq` n'est pas installé sur cette machine, on parse avec Node).
 *
 * Fait, dans l'ordre et seulement sur les fichiers concernés :
 *   1. ESLint sur LE fichier (rapide),
 *   2. `pnpm check:hardcoded` (chaînes en dur, propriétés physiques, ombres),
 *   3. `pnpm typecheck` (incrémental, ~13 s — d'où l'exécution en asynchrone).
 *
 * Sort en 2 si quelque chose échoue, pour réveiller la session avec le détail.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return {}
  }
}

const payload = readPayload()
const filePath =
  payload?.tool_input?.file_path ?? payload?.tool_response?.filePath ?? ''

// Rien à vérifier hors du code source du projet.
if (!/\.(ts|tsx|css)$/.test(filePath) || filePath.includes('routeTree.gen')) {
  process.exit(0)
}

const problems = []

function run(label, command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: true })
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    problems.push(`${label}\n${output.split('\n').slice(-25).join('\n')}`)
  }
}

if (/\.(ts|tsx)$/.test(filePath)) {
  run('eslint', 'pnpm', ['-s', 'exec', 'eslint', JSON.stringify(filePath)])
}

run('check:hardcoded', 'pnpm', ['-s', 'check:hardcoded'])

if (/\.(ts|tsx)$/.test(filePath)) {
  run('typecheck', 'pnpm', ['-s', 'typecheck'])
}

if (problems.length === 0) {
  process.exit(0)
}

process.stderr.write(problems.join('\n\n'))
process.exit(2)
