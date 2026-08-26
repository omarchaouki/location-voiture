/**
 * TÉLÉPHONES MAROCAINS.
 *
 * Un prospect écrit son numéro de six façons différentes : `0612345678`,
 * `06 12 34 56 78`, `06-12-34-56-78`, `+212612345678`, `+212 6 12 34 56 78`,
 * `00212612345678`. Ce sont tous le même numéro, et une base de prospects qui les
 * stocke tels quels contient six fois la même personne sans le savoir.
 *
 * On range donc TOUJOURS en E.164 (`+212612345678`) et on affiche en groupes
 * locaux. Même raisonnement que les plaques (`src/core/plate.ts`) : une forme
 * canonique en base, une forme lisible à l'écran, et la conversion en un seul
 * endroit.
 *
 * Ce que ce module ne fait PAS : vérifier que le numéro existe. Il vérifie qu'il a
 * la forme d'un numéro marocain, ce qui est le maximum vérifiable sans appeler.
 */

/**
 * Préfixes nationaux valides, sans le zéro de tête.
 *
 * `6` et `7` sont les mobiles (`7` a été ouvert à la portabilité et aux nouveaux
 * opérateurs ; le refuser rejetterait de vrais clients). `5` est le fixe, gardé
 * parce qu'une agence donne souvent son numéro d'agence, pas un portable.
 */
const NATIONAL_PREFIXES = ['5', '6', '7'] as const

/** Neuf chiffres après le préfixe pays : un `6` de tête plus huit chiffres. */
const NATIONAL_LENGTH = 9

/**
 * Met un numéro marocain en forme canonique E.164, ou renvoie `null`.
 *
 * Accepte les espaces, points, tirets et parenthèses — un formulaire n'a pas à
 * discipliner celui qui le remplit.
 */
export function parseMoroccanPhone(input: string): string | null {
  const digitsOnly = input.replace(/[^\d+]/g, '')
  if (digitsOnly.length === 0) return null

  let national: string

  if (digitsOnly.startsWith('+212')) national = digitsOnly.slice(4)
  else if (digitsOnly.startsWith('00212')) national = digitsOnly.slice(5)
  else if (digitsOnly.startsWith('212')) national = digitsOnly.slice(3)
  else if (digitsOnly.startsWith('0')) national = digitsOnly.slice(1)
  else national = digitsOnly

  // Un `+` ailleurs qu'en tête n'est pas un numéro, c'est une faute de frappe.
  if (national.includes('+')) return null
  if (national.length !== NATIONAL_LENGTH) return null
  if (!NATIONAL_PREFIXES.some((prefix) => national.startsWith(prefix))) return null

  return `+212${national}`
}

export function isMoroccanPhone(input: string): boolean {
  return parseMoroccanPhone(input) !== null
}

/**
 * Forme lisible : `06 12 34 56 78`.
 *
 * On rend la forme NATIONALE, pas l'internationale : c'est celle qu'un gérant
 * marocain reconnaît et recopie. Les chiffres restent latins — les chiffres
 * arabes-indiens ne se composent pas sur un clavier de téléphone marocain.
 */
export function formatMoroccanPhone(e164: string): string {
  const parsed = parseMoroccanPhone(e164)
  if (!parsed) return e164

  const national = `0${parsed.slice(4)}`
  return [
    national.slice(0, 2),
    national.slice(2, 4),
    national.slice(4, 6),
    national.slice(6, 8),
    national.slice(8, 10),
  ].join(' ')
}
