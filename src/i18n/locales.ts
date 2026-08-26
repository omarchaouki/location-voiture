/**
 * Langues supportées et sens de lecture.
 *
 * Point vérifié (docs/DECISIONS.md É6) : on n'utilise JAMAIS la locale `ar` nue.
 * `ar` formate 1 234 567,89 en "1,234,567.89" alors que `ar-MA` donne "1.234.567,89".
 * Un montant mal formaté se lit à un facteur 1000 près.
 */

export const LOCALES = ['fr', 'ar', 'en'] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'fr'

/** Étiquette Unicode complète, celle qui part réellement dans `Intl`. */
const INTL_TAGS: Record<Locale, string> = {
  fr: 'fr-MA',
  ar: 'ar-MA',
  en: 'en-GB',
}

const DIRECTIONS: Record<Locale, 'ltr' | 'rtl'> = {
  fr: 'ltr',
  ar: 'rtl',
  en: 'ltr',
}

/** Nom de la langue écrit dans cette langue — jamais traduit. */
export const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return DIRECTIONS[locale]
}

export function isRtl(locale: Locale): boolean {
  return DIRECTIONS[locale] === 'rtl'
}

/**
 * Étiquette passée à `Intl`. Le `-u-nu-latn` est une ceinture de sécurité pour les
 * ICU anciennes : sur ICU 77 `ar-MA` résout déjà `latn`, mais on ne parie pas
 * là-dessus sur le téléphone d'un agent.
 */
export function intlTag(locale: Locale): string {
  const tag = INTL_TAGS[locale]
  return locale === 'ar' ? `${tag}-u-nu-latn` : tag
}
