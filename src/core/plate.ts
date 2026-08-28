/**
 * Plaques d'immatriculation marocaines.
 *
 * Forme courante : `<numéro de série> | <lettre arabe> | <code de région>`,
 * par exemple `12345 | أ | 6`. S'y ajoutent les plaques provisoires `WW` (véhicule
 * neuf non immatriculé) et `W` (garage), qui sont des cas réels chez un loueur :
 * la validation les accepte au lieu de les rejeter avec un message technique.
 *
 * Module pur : ni React, ni Drizzle, ni `Intl`. Testable à froid.
 * Voir docs/DOMAIN.md §6.
 */

/** Lettres de série utilisées sur les plaques marocaines, avec leur translittération. */
const LETTERS: ReadonlyArray<{ ar: string; latin: string }> = [
  { ar: 'أ', latin: 'A' },
  { ar: 'ا', latin: 'A' },
  { ar: 'ب', latin: 'B' },
  { ar: 'ج', latin: 'J' },
  { ar: 'د', latin: 'D' },
  { ar: 'ه', latin: 'H' },
  { ar: 'و', latin: 'W' },
  { ar: 'ط', latin: 'T' },
  { ar: 'ش', latin: 'CH' },
]

/**
 * `ا` (alef nu) et `أ` (alef hamza) sont tous deux saisis, mais la forme canonique
 * de la plaque est `أ`. La table latine retient donc la PREMIÈRE occurrence de
 * chaque translittération, pas la dernière — sans quoi `A` produirait `ا`.
 */
const AR_BY_LATIN = new Map<string, string>()
for (const entry of LETTERS) {
  if (!AR_BY_LATIN.has(entry.latin)) AR_BY_LATIN.set(entry.latin, entry.ar)
}

const LATIN_BY_AR = new Map(LETTERS.map((entry) => [entry.ar, entry.latin]))

/** Ramène une lettre saisie (latine ou arabe, variante comprise) à sa forme canonique. */
function canonicalLetter(raw: string): string | undefined {
  const latin = LATIN_BY_AR.get(raw) ?? raw
  return AR_BY_LATIN.get(latin)
}

export type PlateKind = 'standard' | 'temporary'

export interface Plate {
  kind: PlateKind
  /** Numéro de série, 1 à 6 chiffres. */
  serial: string
  /** Lettre de série en arabe. Absente sur les plaques provisoires. */
  letter?: string
  /** Code de région (1 à 99). Absent sur les plaques provisoires. */
  region?: string
  /** Préfixe `W` ou `WW` des plaques provisoires. */
  prefix?: 'W' | 'WW'
}

const SEPARATORS = /[\s|/\-–—_.]+/g
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/g

/** Convertit d'éventuels chiffres arabes orientaux en chiffres latins. */
function toLatinDigits(input: string): string {
  return input.replace(ARABIC_INDIC_DIGITS, (char) => {
    const code = char.charCodeAt(0)
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - base)
  })
}

/**
 * Analyse une saisie libre. Renvoie `null` si la forme n'est pas reconnue —
 * jamais une plaque à moitié devinée.
 */
/**
 * Plaque tapée D'UN SEUL TENANT, sans séparateur : `12345أ6`, `12345A6`, `WW123456`.
 *
 * C'est la saisie la plus naturelle qui soit — c'est ainsi que la plaque est peinte
 * sur le véhicule — et elle était REFUSÉE jusqu'au 27/08/2026, avec le message
 * « plaque invalide » et rien pour comprendre ce qui manquait. Le découpage se faisait
 * uniquement sur les séparateurs, et une saisie sans séparateur donnait un seul bloc,
 * donc `parts.length !== 3`, donc un refus.
 *
 * Le découpage positionnel n'est PAS ambigu : la lettre de série sépare deux groupes
 * de chiffres, et une plaque provisoire commence par sa lettre. `\d{1,6}` est gourmand,
 * l'expression revient donc en arrière jusqu'à trouver la seule coupure valable —
 * `1234CH12` donne bien `1234` + `CH` + `12`.
 *
 * Aucun risque de confusion avec la lettre `و` (translittérée `W`) : une plaque
 * standard commence toujours par des CHIFFRES, une provisoire toujours par `W`.
 */
const GLUED_TEMPORARY = /^(WW|W)(\d{1,8})$/
const GLUED_STANDARD = /^(\d{1,6})([A-Z]{1,2}|[؀-ۿ])(\d{1,2})$/

function splitGlued(cleaned: string): string[] | null {
  const temporary = GLUED_TEMPORARY.exec(cleaned)
  if (temporary?.[1] && temporary[2]) return [temporary[1], temporary[2]]

  const standard = GLUED_STANDARD.exec(cleaned)
  if (standard?.[1] && standard[2] && standard[3]) {
    return [standard[1], standard[2], standard[3]]
  }
  return null
}

export function parsePlate(input: string): Plate | null {
  const cleaned = toLatinDigits(input).trim().replace(SEPARATORS, ' ').toUpperCase()
  if (cleaned.length === 0) return null

  let parts = cleaned.split(' ').filter(Boolean)

  // Un seul bloc : la personne a tapé sans séparateur. On découpe à la forme.
  if (parts.length === 1) {
    const glued = splitGlued(parts[0] ?? '')
    if (glued) parts = glued
  }

  // Plaque provisoire : WW 1234 56 ou WW 123456
  const first = parts[0]
  if (first === 'W' || first === 'WW') {
    const digits = parts.slice(1).join('')
    if (!/^\d{1,8}$/.test(digits)) return null
    return { kind: 'temporary', prefix: first, serial: digits }
  }

  if (parts.length !== 3) return null

  const [serial, rawLetter, region] = parts
  if (serial === undefined || rawLetter === undefined || region === undefined) return null
  if (!/^\d{1,6}$/.test(serial)) return null
  if (!/^\d{1,2}$/.test(region)) return null

  const letter = canonicalLetter(rawLetter)
  if (letter === undefined) return null

  return { kind: 'standard', serial, letter, region }
}

/**
 * Clé de recherche et d'unicité : chiffres et lettre translittérée, sans séparateur.
 * C'est cette valeur qui porte l'index unique `(org_id, plate_normalized)`.
 */
export function normalizePlate(plate: Plate): string {
  if (plate.kind === 'temporary') {
    return `${plate.prefix ?? 'WW'}${plate.serial}`
  }
  const latin = plate.letter ? (LATIN_BY_AR.get(plate.letter) ?? plate.letter) : ''
  return `${plate.serial}${latin}${plate.region ?? ''}`
}

/**
 * Forme d'affichage. Le séparateur est une barre fine entourée d'espaces fines,
 * comme sur la plaque physique.
 *
 * ATTENTION : cette chaîne mélange chiffres latins et lettre arabe. Elle DOIT être
 * rendue dans un conteneur isolé en bidi (`<Plate>` s'en charge), sinon l'ordre des
 * blocs s'inverse à la lecture — y compris en interface française.
 */
export function formatPlate(plate: Plate): string {
  if (plate.kind === 'temporary') {
    return `${plate.prefix ?? 'WW'} ${plate.serial}`
  }
  return `${plate.serial} | ${plate.letter ?? ''} | ${plate.region ?? ''}`
}

/** Raccourci : saisie libre → forme normalisée, ou `null`. */
export function normalizePlateInput(input: string): string | null {
  const parsed = parsePlate(input)
  return parsed ? normalizePlate(parsed) : null
}
