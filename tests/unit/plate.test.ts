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
