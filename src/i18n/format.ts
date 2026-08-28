/**
 * LE SEUL ENDROIT où `Intl` est appelé.
 *
 * Aucun composant n'a le droit d'instancier `Intl.NumberFormat` ou `Intl.DateTimeFormat`
 * directement — un test le vérifie (tests/unit/i18n-format.test.ts) et le hook de pré-commit
 * le refuse. Raison : docs/DECISIONS.md É6 (séparateurs `ar` vs `ar-MA`) et É7 (Ramadan).
 */

import { intlTag, type Locale } from './locales'

/** Fuseau du métier. Bascule à UTC+0 pendant le Ramadan — jamais d'offset codé en dur. */
export const BUSINESS_TIMEZONE = 'Africa/Casablanca'

const numberCache = new Map<string, Intl.NumberFormat>()
const dateCache = new Map<string, Intl.DateTimeFormat>()

function numberFormatter(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  const cached = numberCache.get(key)
  if (cached) return cached
  const created = new Intl.NumberFormat(intlTag(locale), { numberingSystem: 'latn', ...options })
  numberCache.set(key, created)
  return created
}

function dateFormatter(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}:${JSON.stringify(options)}`
  const cached = dateCache.get(key)
  if (cached) return cached
  const created = new Intl.DateTimeFormat(intlTag(locale), {
    timeZone: BUSINESS_TIMEZONE,
    numberingSystem: 'latn',
    ...options,
  })
  dateCache.set(key, created)
  return created
}

/* --------------------------------------------------------------------------
 * Argent — l'entrée est TOUJOURS en centimes entiers (charte de portabilité).
 * ------------------------------------------------------------------------ */

export function formatMoney(
  cents: number,
  locale: Locale,
  currency = 'MAD',
  options: { withDecimals?: boolean } = {},
): string {
  const withDecimals = options.withDecimals ?? true
  return numberFormatter(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(cents / 100)
}

/** Montant sans symbole, pour les colonnes de tableau où la devise est en en-tête. */
export function formatAmount(cents: number, locale: Locale): string {
  return numberFormatter(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatNumber(value: number, locale: Locale): string {
  return numberFormatter(locale, {}).format(value)
}

/**
 * Latitude ou longitude.
 *
 * Cinq décimales, soit environ un mètre : c'est la précision d'un traceur, et
 * `formatNumber` en montrerait trois — cent mètres, de quoi placer un centre de zone
 * dans la rue d'à côté sans que personne ne s'en aperçoive.
 */
export function formatCoordinate(value: number, locale: Locale): string {
  return numberFormatter(locale, {
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  }).format(value)
}

export function formatKilometers(km: number, locale: Locale): string {
  return numberFormatter(locale, { maximumFractionDigits: 0 }).format(km)
}

/* --------------------------------------------------------------------------
 * Dates — l'entrée est TOUJOURS une chaîne ISO UTC ou une date civile YYYY-MM-DD.
 * ------------------------------------------------------------------------ */

export function formatDate(isoOrCivil: string, locale: Locale): string {
  return dateFormatter(locale, { dateStyle: 'medium' }).format(toDate(isoOrCivil))
}

export function formatDateTime(iso: string, locale: Locale): string {
  return dateFormatter(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(toDate(iso))
}

/**
 * L'HEURE SEULE.
 *
 * Le tableau de bord liste les retours attendus par jour : la date est déjà portée par
 * la colonne, la répéter sur chaque ligne coûte de la largeur et n'apprend rien. Ce
 * qu'on veut lire, c'est « 14:30 ».
 *
 * Elle passe par `dateFormatter` comme le reste — jamais un `Intl` écrit sur place :
 * la locale du produit est `ar-MA`, jamais `ar`, et les deux n'ont pas les mêmes
 * chiffres (docs/DECISIONS.md É7).
 */
export function formatTime(iso: string, locale: Locale): string {
  return dateFormatter(locale, { timeStyle: 'short' }).format(toDate(iso))
}

export function formatDateShort(isoOrCivil: string, locale: Locale): string {
  return dateFormatter(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    toDate(isoOrCivil),
  )
}

/**
 * Une date civile (`YYYY-MM-DD`) n'est pas un instant : la lire comme un instant UTC
 * puis l'afficher en heure locale décale l'affichage d'un jour selon le fuseau.
 * On la fixe donc à midi UTC, ce qui la rend insensible à un décalage de ±12 h.
 */
function toDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00Z`)
  }
  return new Date(value)
}

/* --------------------------------------------------------------------------
 * Heure locale du métier — pour le moteur d'alertes (digest à 8h) et l'affichage.
 * ------------------------------------------------------------------------ */

/** Parties de date/heure dans le fuseau du métier, sans jamais additionner d'offset. */
export function businessParts(instant: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instant)

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type)
    return found ? Number.parseInt(found.value, 10) : 0
  }

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour') % 24,
    minute: read('minute'),
  }
}

/** Date civile (`YYYY-MM-DD`) telle que vue à Casablanca à cet instant. */
export function businessCivilDate(instant: Date): string {
  const { year, month, day } = businessParts(instant)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
