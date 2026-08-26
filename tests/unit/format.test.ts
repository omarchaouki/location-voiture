import { describe, expect, it } from 'vitest'

import {
  businessCivilDate,
  businessParts,
  formatAmount,
  formatDate,
  formatCoordinate,
  formatKilometers,
  formatMoney,
} from '~/i18n/format'
import { intlTag } from '~/i18n/locales'

/**
 * Ces tests protègent les deux pièges vérifiés en Phase 0 (docs/DECISIONS.md É6 et É7).
 * Ce ne sont pas des tests de bibliothèque : ce sont des tests de règle métier.
 */

describe('locale arabe', () => {
  /**
   * `ar` nu formate 1 250,00 en "1,250.00" ; `ar-MA` en "1.250,00".
   * Un montant mal formaté se lit à un facteur 1000 près.
   */
  it('n’utilise jamais la locale `ar` nue', () => {
    expect(intlTag('ar')).toContain('ar-MA')
    expect(intlTag('ar').startsWith('ar-MA')).toBe(true)
  })

  it('force les chiffres latins en arabe', () => {
    const formatted = formatKilometers(91340, 'ar')
    expect(formatted).toMatch(/\d/)
    // Aucun chiffre arabe oriental ne doit sortir.
    expect(formatted).not.toMatch(/[٠-٩۰-۹]/)
  })

  it('utilise les mêmes séparateurs qu’en français marocain', () => {
    expect(formatAmount(123456789, 'ar')).toBe(formatAmount(123456789, 'fr'))
  })
})

describe('formatMoney', () => {
  it('prend des centimes entiers et jamais un flottant', () => {
    expect(formatMoney(125000, 'fr')).toContain('1.250,00')
    expect(formatMoney(0, 'fr')).toContain('0,00')
  })

  it('peut masquer les décimales sans changer la valeur', () => {
    expect(formatMoney(125000, 'fr', 'MAD', { withDecimals: false })).not.toContain(',00')
  })
})

describe('formatDate', () => {
  /**
   * Une date civile n'est pas un instant : lue comme minuit UTC puis affichée en
   * heure locale, elle reculerait d'un jour. Elle est donc ancrée à midi UTC.
   */
  it('n’avance ni ne recule d’un jour', () => {
    expect(formatDate('2026-08-21', 'fr')).toContain('2026')
    expect(formatDate('2026-01-01', 'fr')).toContain('2026')
    expect(formatDate('2026-12-31', 'fr')).toContain('2026')
  })
})

describe('heure locale du métier', () => {
  /**
   * Le Maroc est à UTC+1 toute l'année SAUF pendant le Ramadan, où il repasse à
   * UTC+0, sur des dates qui glissent chaque année. Un digest « 8h » calculé avec
   * un offset fixe partirait à 7h pendant six semaines par an.
   */
  it('suit la bascule d’offset du Ramadan', () => {
    const janvier = businessParts(new Date('2026-01-15T12:00:00Z'))
    const ramadan = businessParts(new Date('2026-03-01T12:00:00Z'))
    const avril = businessParts(new Date('2026-04-05T12:00:00Z'))

    expect(janvier.hour).toBe(13) // UTC+1
    expect(ramadan.hour).toBe(12) // UTC+0
    expect(avril.hour).toBe(13) // UTC+1
  })

  it('donne la date civile telle que vue à Casablanca', () => {
    // 23h30 UTC un 21 août = 00h30 le 22 à Casablanca (UTC+1).
    expect(businessCivilDate(new Date('2026-08-21T23:30:00Z'))).toBe('2026-08-22')
    // La même heure en plein Ramadan reste le 21 (UTC+0).
    expect(businessCivilDate(new Date('2026-03-01T23:30:00Z'))).toBe('2026-03-01')
  })
})

describe('coordonnées', () => {
  /**
   * Cinq décimales, soit environ un mètre. Trois — le défaut d'`Intl` — placeraient
   * le centre d'une zone à cent mètres de là où l'utilisateur a cliqué.
   */
  it('garde cinq décimales', () => {
    expect(formatCoordinate(33.5945, 'fr')).toMatch(/33[,.]59450/)
    expect(formatCoordinate(-7.6167, 'fr')).toMatch(/7[,.]61670/)
  })

  it('suit le séparateur décimal de `ar-MA`, en chiffres latins', () => {
    const formatted = formatCoordinate(33.5945, 'ar')
    expect(formatted).toMatch(/\d/)
    // `ar-MA` utilise la virgule décimale, comme le français — et non le point de `ar`.
    expect(formatted).toContain(',')
  })
})
