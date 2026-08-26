/**
 * Arithmétique de dates civiles.
 *
 * Une échéance administrative (assurance, visite technique, vignette) est une DATE
 * CIVILE `YYYY-MM-DD`, pas un instant. La traiter comme un instant UTC décale
 * l'affichage d'un jour selon le fuseau, et fait partir une alerte « J-0 » la veille.
 *
 * Module pur : ni React, ni Drizzle, ni fuseau. Testable à dates figées.
 * Voir docs/DOMAIN.md §1 et docs/DECISIONS.md É7.
 */

const MS_PER_DAY = 86_400_000
const CIVIL_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type CivilDate = string

export function isCivilDate(value: string): value is CivilDate {
  return CIVIL_PATTERN.test(value)
}

/** Midi UTC : insensible à un décalage de ±12 h, donc au Ramadan comme à l'heure d'été. */
function civilToUtcNoon(date: CivilDate): number {
  return Date.parse(`${date}T12:00:00Z`)
}

/** Nombre de jours civils de `from` vers `to`. Négatif si `to` est dans le passé. */
export function civilDaysBetween(from: CivilDate, to: CivilDate): number {
  return Math.round((civilToUtcNoon(to) - civilToUtcNoon(from)) / MS_PER_DAY)
}

export function addCivilDays(date: CivilDate, days: number): CivilDate {
  const shifted = new Date(civilToUtcNoon(date) + days * MS_PER_DAY)
  return toCivilDate(shifted)
}

export function addCivilMonths(date: CivilDate, months: number): CivilDate {
  const base = new Date(civilToUtcNoon(date))
  const day = base.getUTCDate()
  base.setUTCDate(1)
  base.setUTCMonth(base.getUTCMonth() + months)
  // 31 janvier + 1 mois = 28/29 février, pas le 3 mars.
  const lastDay = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0, 12),
  ).getUTCDate()
  base.setUTCDate(Math.min(day, lastDay))
  return toCivilDate(base)
}

function toCivilDate(date: Date): CivilDate {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Partie civile d'un instant ISO, en UTC. Pour l'heure locale, voir i18n/format.ts. */
export function civilDateOfIso(iso: string): CivilDate {
  const parsed = iso.slice(0, 10)
  return isCivilDate(parsed) ? parsed : toCivilDate(new Date(iso))
}
