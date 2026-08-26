import { describe, expect, it } from 'vitest'

import { buildLogbook, nextMaintenanceDue, type LogbookSource } from '~/core/logbook'

/**
 * Le carnet décide ce qu'un gérant voit en ouvrant une fiche véhicule.
 * Tests à DATES FIGÉES : aucun ne dépend de l'heure réelle.
 */

const TODAY = '2026-08-22'

function source(overrides: Partial<LogbookSource> = {}): LogbookSource {
  return {
    today: TODAY,
    currentKm: 91_340,
    dailyKmAverage: 100,
    ...overrides,
  }
}

describe('documents administratifs', () => {
  it('classe une échéance passée en « dépassée » et une future en « à venir »', () => {
    const entries = buildLogbook(
      source({
        insurance: { id: 'a', expiresOn: '2027-03-14' },
        inspection: { id: 'b', expiresOn: '2026-08-01' },
      }),
    )

    expect(entries.find((e) => e.kind === 'insurance')?.state).toBe('upcoming')
    expect(entries.find((e) => e.kind === 'inspection')?.state).toBe('overdue')
  })

  it('rend les entrées triées par date', () => {
    const entries = buildLogbook(
      source({
        insurance: { id: 'a', expiresOn: '2027-03-14' },
        inspection: { id: 'b', expiresOn: '2026-11-03' },
        permits: [{ id: 'c', expiresOn: '2026-09-10' }],
      }),
    )
    expect(entries.map((e) => e.date)).toEqual(['2026-09-10', '2026-11-03', '2027-03-14'])
  })

  /** La carte grise n'expire pas au Maroc : elle n'a rien à faire sur la frise. É1. */
  it('ne place jamais la carte grise sur la frise', () => {
    const entries = buildLogbook(source({ insurance: { id: 'a', expiresOn: '2027-03-14' } }))
    expect(entries.map((e) => e.kind)).not.toContain('registration')
  })
})

describe('vignette', () => {
  /** Campagne annuelle, pas date glissante. É3. */
  it('non payée avant la fin de la fenêtre : à venir, datée fin janvier', () => {
    const entries = buildLogbook(
      source({ today: '2026-01-10', roadTax: { id: 'v', year: 2026, paidAt: null } }),
    )
    const vignette = entries.find((e) => e.kind === 'roadTax')
    expect(vignette?.date).toBe('2026-01-31')
    expect(vignette?.state).toBe('upcoming')
    expect(vignette?.detail).toBe('2026')
  })

  it('non payée après la fenêtre : en infraction, et ça dure', () => {
    const entries = buildLogbook(source({ roadTax: { id: 'v', year: 2026, paidAt: null } }))
    expect(entries.find((e) => e.kind === 'roadTax')?.state).toBe('overdue')
  })

  it('payée : marquée faite, à la date du paiement', () => {
    const entries = buildLogbook(
      source({ roadTax: { id: 'v', year: 2026, paidAt: '2026-01-18' } }),
    )
    const vignette = entries.find((e) => e.kind === 'roadTax')
    expect(vignette?.state).toBe('done')
    expect(vignette?.date).toBe('2026-01-18')
  })
})

describe('vidange', () => {
  it('retient le PREMIER seuil atteint, kilomètres ou temps', () => {
    // 800 km restants à 100 km/jour = 8 jours, donc bien avant l'échéance de date.
    const entries = buildLogbook(
      source({
        maintenance: [
          { id: 'm', kind: 'oil_change', nextDueOn: '2026-12-01', nextDueKm: 92_140 },
        ],
      }),
    )
    const vidange = entries.find((e) => e.kind === 'oilChange')
    expect(vidange?.date).toBe('2026-08-30')
    expect(vidange?.detail).toBe('~8 j · 800 km')
  })

  it('retient la date quand elle tombe avant le kilométrage', () => {
    const entries = buildLogbook(
      source({
        maintenance: [
          { id: 'm', kind: 'oil_change', nextDueOn: '2026-08-25', nextDueKm: 200_000 },
        ],
      }),
    )
    expect(entries.find((e) => e.kind === 'oilChange')?.date).toBe('2026-08-25')
  })

  /** Véhicule immobilisé : pas de division par zéro, pas d'échéance « dans 9999 jours ». */
  it('supporte une moyenne quotidienne nulle', () => {
    const entries = buildLogbook(
      source({
        dailyKmAverage: 0,
        maintenance: [
          { id: 'm', kind: 'oil_change', nextDueOn: '2026-10-01', nextDueKm: 95_000 },
        ],
      }),
    )
    const vidange = entries.find((e) => e.kind === 'oilChange')
    expect(vidange?.date).toBe('2026-10-01')
    expect(vidange?.detail).toBe('3660 km')
  })

  /** Véhicule trop récent pour avoir une moyenne : on n'affiche que les kilomètres. */
  it('supporte une moyenne inconnue', () => {
    const entries = buildLogbook(
      source({
        dailyKmAverage: null,
        maintenance: [{ id: 'm', kind: 'oil_change', nextDueOn: null, nextDueKm: 95_000 }],
      }),
    )
    expect(entries.find((e) => e.kind === 'oilChange')).toBeUndefined()
  })

  it('n’affiche jamais un reste négatif', () => {
    const entries = buildLogbook(
      source({
        maintenance: [
          { id: 'm', kind: 'oil_change', nextDueOn: '2026-07-01', nextDueKm: 80_000 },
        ],
      }),
    )
    const vidange = entries.find((e) => e.kind === 'oilChange')
    expect(vidange?.state).toBe('overdue')
    expect(vidange?.detail).toBe('~0 j · 0 km')
  })
})

describe('contrats', () => {
  it('un contrat clos est fait, un contrat en cours suit sa date de retour', () => {
    const entries = buildLogbook(
      source({
        contracts: [
          { id: '1', reference: '2026-000198', endOn: '2026-06-02', closed: true },
          { id: '2', reference: '2026-000241', endOn: '2026-08-24', closed: false },
          { id: '3', reference: '2026-000240', endOn: '2026-08-20', closed: false },
        ],
      }),
    )
    expect(entries.find((e) => e.detail === '2026-000198')?.state).toBe('done')
    expect(entries.find((e) => e.detail === '2026-000241')?.state).toBe('upcoming')
    // Retour dépassé sans clôture : en retard.
    expect(entries.find((e) => e.detail === '2026-000240')?.state).toBe('overdue')
  })
})

describe('nextMaintenanceDue', () => {
  it('calcule les deux bornes à partir du dernier passage', () => {
    expect(
      nextMaintenanceDue({
        performedOn: '2026-03-14',
        km: 74_210,
        intervalMonths: 6,
        intervalKm: 10_000,
      }),
    ).toEqual({ nextDueOn: '2026-09-14', nextDueKm: 84_210 })
  })

  it('accepte qu’une seule borne existe', () => {
    expect(
      nextMaintenanceDue({ performedOn: '2026-03-14', km: null, intervalMonths: 12, intervalKm: 10_000 }),
    ).toEqual({ nextDueOn: '2027-03-14', nextDueKm: null })
  })
})
