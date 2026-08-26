/**
 * Contrôles déterministes que ESLint ne sait pas faire.
 *
 *   pnpm check:hardcoded
 *
 * « Ce qui est déterministe doit être un hook, pas une bonne intention. »
 * Ce script est appelé par le hook de pré-commit et par la CI.
 *
 * Limite connue et assumée : la détection i18n couvre le TEXTE JSX et les attributs
 * visibles (`title`, `placeholder`, `aria-label`, `alt`). Elle ne couvre pas encore
 * les chaînes rangées dans des constantes puis rendues plus loin. C'est un trou réel,
 * listé dans docs/AUDIT.md ; il se comblera avec une analyse d'AST, pas avec une regex.
 *
 * Échappatoire unique et volontairement voyante : la ligne `// i18n-exempt` ou
 * `// physical-css-exempt` en tête de fichier. Elle doit rester rarissime et
 * s'accompagner d'une raison écrite.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import * as schema from '../src/db/schema'

const ROOT = process.cwd()
const SCAN_DIRS = ['src']

interface Finding {
  file: string
  line: number
  rule: string
  detail: string
}

const findings: Finding[] = []

/* ---------------------------------------------------------------- règles */

/** Propriétés physiques : elles cassent l'arabe. docs/DESIGN.md §3. */
const PHYSICAL_CLASS =
  /(?:^|["'\s`])-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|inset-l|inset-r)-[a-z0-9[\]().%/-]+/g
const PHYSICAL_TEXT_ALIGN = /\btext-(?:left|right)\b/g
const PHYSICAL_CSS_PROP = /\b(?:margin|padding|border)-(?:left|right)\s*:/g

/** L'ombre est réservée aux couches flottantes (menu, dialogue, infobulle). */
/*
 * Ombres. `shadow-card` est la SEULE exception de contenu : elle resout vers le jeton
 * `--elevation-card`, un lisere porte d'un pixel, defini une fois dans tokens.css.
 * Tout le reste (`shadow-lg`, `shadow-[0_4px...]`, `box-shadow:` ecrit a la main) reste
 * interdit hors de la couche flottante : c'est ainsi qu'une interface derive, une ombre
 * a la fois, vers un empilement de cartes sans hierarchie.
 */
const SHADOW = /\bshadow-(?!none\b|card\b)[a-z0-9[\]()/-]+|box-shadow\s*:/g
const SHADOW_ALLOWED = ['src/styles/tokens.css', 'src/ui/overlay/']

/** Chaîne visible codée en dur dans un composant. */
/**
 * Le texte doit être suivi d'une balise FERMANTE (`</`).
 *
 * Sans cette contrainte, la syntaxe générique de TypeScript est prise pour du texte :
 * `() => Promise<unknown>` ressemble exactement à `>texte<` pour une expression
 * régulière. Faux positif rencontré en Phase 4 — c'est la limite documentée en tête
 * de fichier, et elle se paie en bruit tant qu'on n'analyse pas l'AST.
 */
const JSX_TEXT = />\s*([A-Za-zÀ-ÿ][^<>{}\n]{2,})<\//g
const TEXT_ATTRIBUTE = /\b(?:title|placeholder|aria-label|alt|aria-description)\s*=\s*"([^"]{2,})"/g

const CONSOLE_LOG = /\bconsole\.log\s*\(/g

/** Bibliothèques d'icônes : le jeu est maison. */
const ICON_LIBRARY = /from\s+['"](?:lucide-react|@heroicons\/react|react-icons)/g

/**
 * Accès direct à une table CLOISONNÉE hors des repositories.
 *
 * La règle est écrite depuis la Phase 0 (« aucun accès `db.select(...)` hors de
 * `src/db/repositories/` ») et n'était vérifiée par personne. Elle a laissé passer,
 * pendant cinq phases, une lecture des contrats sans filtre `org_id` ni `deleted_at`
 * dans la fiche véhicule — trouvée à l'œil en Phase 8, en cherchant autre chose.
 *
 * Le contrôle ne regarde pas le préfixe `db.` : il regarde la TABLE. Les tables de
 * plateforme (organisations, membres, utilisateurs, plans, journal d'audit) n'ont pas
 * d'`org_id` et se lisent légitimement hors repository ; ce sont les tables métier,
 * celles qui portent `org_id`, qui ne le doivent jamais.
 *
 * La liste est déduite du schéma lui-même : une nouvelle table cloisonnée entre dans
 * le contrôle sans que personne ait à y penser.
 */
const ORG_SCOPED_TABLES = new Set(
  Object.entries(schema)
    .filter(([, value]) => {
      if (typeof value !== 'object' || value === null) return false
      const columns = value as { orgId?: unknown; deletedAt?: unknown; id?: unknown }
      return Boolean(columns.orgId && columns.deletedAt && columns.id)
    })
    .map(([name]) => name),
)

/**
 * Deux tables portent un `org_id` sans relever du cloisonnement ordinaire, et se
 * lisent donc légitimement hors repository. Chacune a sa raison, et il n'y en a que
 * deux — allonger cette liste doit rester inconfortable.
 */
const PLATFORM_TABLES: ReadonlyMap<string, string> = new Map([
  ['auditLog', "journal d'audit : `org_id` est nullable, et il s'écrit depuis partout"],
  [
    'impersonationSessions',
    "acte de plateforme : le propriétaire de plateforme n'est membre d'aucune organisation",
  ],
])

/**
 * Formulaire sans `method="post"`.
 *
 * Un `<form>` sans méthode est un formulaire GET. Tant que React intercepte la
 * soumission, cela ne se voit pas — le jour où le paquet client casse, le navigateur
 * reprend la main et place TOUS LES CHAMPS DANS L'URL. C'est arrivé le 25/08/2026 sur
 * l'écran de connexion : adresse et mot de passe se sont retrouvés dans la barre
 * d'adresse, donc dans l'historique et dans les journaux.
 *
 * En POST, la même panne produit une requête sans effet au lieu d'une fuite.
 */
const FORM_WITHOUT_POST = /<form(?![\w-])(?![^>]*method=)/g

/** `.from(vehicles)`, `.insert(contracts)`, `.update(alerts)`, `.delete(gpsPositions)`. */
const DIRECT_TABLE_ACCESS = /\.(?:from|insert|update|delete)\(\s*([A-Za-z_$][\w$]*)\s*\)/g

/* ------------------------------------------------------------- parcours */

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else if (/\.(tsx?|css)$/.test(entry) && !entry.endsWith('.gen.ts')) {
      out.push(full)
    }
  }
  return out
}

function report(file: string, source: string, pattern: RegExp, rule: string, detail: string) {
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const line = source.slice(0, match.index).split('\n').length
    findings.push({ file, line, rule, detail: `${detail} — ${match[0].trim().slice(0, 60)}` })
  }
}

for (const absolute of SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)))) {
  const file = relative(ROOT, absolute).replaceAll('\\', '/')
  const source = readFileSync(absolute, 'utf8')
  const header = source.slice(0, 600)

  report(file, source, CONSOLE_LOG, 'console', 'console.log oublié')
  report(file, source, ICON_LIBRARY, 'icons', "bibliothèque d'icônes tierce")

  // Les repositories SONT l'endroit prévu pour ces accès ; le schéma les déclare.
  if (!file.startsWith('src/db/')) {
    DIRECT_TABLE_ACCESS.lastIndex = 0
    let access: RegExpExecArray | null
    while ((access = DIRECT_TABLE_ACCESS.exec(source)) !== null) {
      const table = access[1]
      if (!table || !ORG_SCOPED_TABLES.has(table)) continue
      if (PLATFORM_TABLES.has(table)) continue
      const line = source.slice(0, access.index).split('\n').length
      findings.push({
        file,
        line,
        rule: 'tenant',
        detail: `table cloisonnée « ${table} » lue hors repository — passer par forOrg()`,
      })
    }
  }

  if (!header.includes('physical-css-exempt')) {
    report(file, source, PHYSICAL_CLASS, 'rtl', 'classe physique (utiliser ms-/me-/ps-/pe-/start-/end-)')
    report(file, source, PHYSICAL_TEXT_ALIGN, 'rtl', 'alignement physique (utiliser text-start/text-end)')
    report(file, source, PHYSICAL_CSS_PROP, 'rtl', 'propriété CSS physique (utiliser *-inline-start/end)')
  }

  if (!SHADOW_ALLOWED.some((allowed) => file.startsWith(allowed))) {
    report(file, source, SHADOW, 'shadow', 'ombre hors couche flottante (la direction est aux filets)')
  }

  if (file.endsWith('.tsx')) {
    report(
      file,
      source,
      FORM_WITHOUT_POST,
      'form',
      'formulaire sans method="post" — en GET, les champs partent dans l’URL',
    )
  }

  if (file.endsWith('.tsx') && !header.includes('i18n-exempt')) {
    report(file, source, JSX_TEXT, 'i18n', 'texte en dur dans un composant')
    report(file, source, TEXT_ATTRIBUTE, 'i18n', 'attribut visible en dur')
  }
}

/* --------------------------------------------------------------- sortie */

if (findings.length === 0) {
  console.log('Aucune infraction.')
  process.exit(0)
}

const byRule = new Map<string, Finding[]>()
for (const finding of findings) {
  byRule.set(finding.rule, [...(byRule.get(finding.rule) ?? []), finding])
}

for (const [rule, list] of byRule) {
  console.log(`\n[${rule}] ${list.length} infraction(s)`)
  for (const finding of list.slice(0, 25)) {
    console.log(`  ${finding.file}:${finding.line}  ${finding.detail}`)
  }
  if (list.length > 25) console.log(`  … et ${list.length - 25} autres`)
}

console.log(`\n${findings.length} infraction(s) au total.`)
process.exit(1)
