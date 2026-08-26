import { describe, expect, it } from 'vitest'

import { addCivilDays, addCivilMonths, civilDaysBetween, civilDateOfIso } from '~/core/dates'

describe('civilDaysBetween', () => {
  it('compte les jours civils dans les deux sens', () => {
    expect(civilDaysBetween('2026-08-21', '2026-08-23')).toBe(2)
    expect(civilDaysBetween('2026-08-23', '2026-08-21')).toBe(-2)
    expect(civilDaysBetween('2026-08-21', '2026-08-21')).toBe(0)
  })

  it('traverse un changement de mois et une année bissextile', () => {
    expect(civilDaysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(civilDaysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })

  /**
   * Le Maroc repasse à UTC+0 pendant le Ramadan (docs/DECISIONS.md É7).
   * Une date civile ne doit PAS bouger d'un jour à cause de ce changement d'offset :
   * c'est exactement le bug qui ferait partir une alerte « J-0 » la veille.
   */
  it('reste stable de part et d’autre des bascules d’offset marocaines', () => {
    expect(civilDaysBetween('2026-02-10', '2026-02-20')).toBe(10)
    expect(civilDaysBetween('2026-03-25', '2026-04-10')).toBe(16)
    expect(civilDaysBetween('2026-01-15', '2026-08-21')).toBe(218)
  })
})

describe('addCivilDays', () => {
  it('ajoute et retire des jours', () => {
    expect(addCivilDays('2026-08-21', 3)).toBe('2026-08-24')
    expect(addCivilDays('2026-08-21', -22)).toBe('2026-07-30')
    expect(addCivilDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('addCivilMonths', () => {
  it('ajoute des mois', () => {
    expect(addCivilMonths('2026-08-21', 12)).toBe('2027-08-21')
    expect(addCivilMonths('2026-11-03', 2)).toBe('2027-01-03')
  })

  /** 31 janvier + 1 mois = fin février, pas le 3 mars. Une visite technique ne dérive pas. */
  it('borne au dernier jour du mois cible', () => {
    expect(addCivilMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addCivilMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addCivilMonths('2026-05-31', 1)).toBe('2026-06-30')
  })
})

describe('civilDateOfIso', () => {
  it('extrait la partie civile UTC', () => {
    expect(civilDateOfIso('2026-08-21T23:30:00.000Z')).toBe('2026-08-21')
  })
})
