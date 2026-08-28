import { describe, expect, it } from 'vitest'

import { formatPlate, normalizePlateInput, parsePlate } from '~/core/plate'

describe('parsePlate', () => {
  it('accepte les séparateurs réellement tapés par un agent', () => {
    const expected = { kind: 'standard', serial: '12345', letter: 'أ', region: '6' }
    expect(parsePlate('12345|أ|6')).toEqual(expected)
    expect(parsePlate('12345 أ 6')).toEqual(expected)
    expect(parsePlate('12345-أ-6')).toEqual(expected)
    expect(parsePlate('  12345 / أ / 6  ')).toEqual(expected)
  })

  it('accepte la lettre translittérée en latin', () => {
    expect(parsePlate('12345 A 6')?.letter).toBe('أ')
    expect(parsePlate('44120 b 12')?.letter).toBe('ب')
  })

  /** Un agent peut coller des chiffres arabes orientaux depuis un PDF administratif. */
  it('convertit les chiffres arabes orientaux', () => {
    expect(parsePlate('١٢٣٤٥ أ ٦')).toEqual({
      kind: 'standard',
      serial: '12345',
      letter: 'أ',
      region: '6',
    })
  })

  it('accepte les plaques provisoires WW et W', () => {
    expect(parsePlate('WW 4471')).toEqual({ kind: 'temporary', prefix: 'WW', serial: '4471' })
    expect(parsePlate('W-1234-56')).toEqual({ kind: 'temporary', prefix: 'W', serial: '123456' })
  })

  /**
   * Saisie SANS séparateur — c'est ainsi que la plaque est peinte sur la voiture, et
   * c'est la première chose que tape quelqu'un qui la recopie. Refusée jusqu'au
   * 27/08/2026, sans que le message dise ce qui manquait.
   */
  it('accepte une plaque tapée d’un seul tenant', () => {
    expect(parsePlate('12345أ6')).toEqual({
      kind: 'standard',
      serial: '12345',
      letter: 'أ',
      region: '6',
    })
    expect(parsePlate('12345A6')).toEqual({
      kind: 'standard',
      serial: '12345',
      letter: 'أ',
      region: '6',
    })
    // La lettre à deux caractères ne casse pas le découpage : `\d{1,6}` revient en
    // arrière jusqu'à la seule coupure qui laisse une région valide.
    expect(parsePlate('1234CH12')).toEqual({
      kind: 'standard',
      serial: '1234',
      letter: 'ش',
      region: '12',
    })
    expect(parsePlate('ww123456')).toEqual({
      kind: 'temporary',
      prefix: 'WW',
      serial: '123456',
    })
  })

  /**
   * `و` se translittère en `W`, comme le préfixe provisoire. La distinction tient à
   * la POSITION : une plaque standard commence par des chiffres, une provisoire par
   * sa lettre. Sans cette règle, `12345W6` deviendrait une plaque provisoire.
   */
  it('ne confond pas la lettre W collée avec une plaque provisoire', () => {
    expect(parsePlate('12345W6')).toEqual({
      kind: 'standard',
      serial: '12345',
      letter: 'و',
      region: '6',
    })
    expect(parsePlate('W123456')?.kind).toBe('temporary')
  })

  it('refuse plutôt que de deviner', () => {
    expect(parsePlate('')).toBeNull()
    expect(parsePlate('12345')).toBeNull()
    expect(parsePlate('12345 Z 6')).toBeNull()
    expect(parsePlate('1234567 أ 6')).toBeNull()
    expect(parsePlate('12345 أ 123')).toBeNull()
  })
})

describe('normalizePlateInput', () => {
  /** C'est cette valeur qui porte l'index unique `(org_id, plate_normalized)`. */
  it('donne la même clé quelles que soient la saisie et la langue', () => {
    const key = normalizePlateInput('12345|أ|6')
    expect(key).toBe('12345A6')
    expect(normalizePlateInput('12345 A 6')).toBe(key)
    expect(normalizePlateInput('  12345 - أ - 6 ')).toBe(key)
    expect(normalizePlateInput('١٢٣٤٥ أ ٦')).toBe(key)
  })

  it('distingue deux plaques de régions différentes', () => {
    expect(normalizePlateInput('12345|أ|6')).not.toBe(normalizePlateInput('12345|أ|1'))
  })
})

describe('formatPlate', () => {
  it('rend la forme d’affichage à trois blocs', () => {
    const plate = parsePlate('12345 A 6')
    expect(plate).not.toBeNull()
    expect(formatPlate(plate!)).toBe('12345 | أ | 6')
  })
})
