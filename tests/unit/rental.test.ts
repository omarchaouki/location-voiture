import { describe, expect, it } from 'vitest'

import {
  assertTransition,
  billableDays,
  canTransition,
  checkSignature,
  findOverlap,
  InvalidTransitionError,
  isOverridable,
  nextReference,
  priceRental,
} from '~/core/rental'

/**
 * Règles de location. Tout est à valeurs figées : ni horloge, ni aléatoire.
 */

const TODAY = '2026-08-22'

describe('jours facturés', () => {
  /** Un loueur facture des jours ENTAMÉS : 24 h et 10 minutes font deux jours. */
  it('compte les jours entamés', () => {
    expect(billableDays('2026-08-22T09:00:00Z', '2026-08-23T09:00:00Z')).toBe(1)
    expect(billableDays('2026-08-22T09:00:00Z', '2026-08-23T09:10:00Z')).toBe(2)
    expect(billableDays('2026-08-22T09:00:00Z', '2026-08-29T09:00:00Z')).toBe(7)
  })

  /** Une location du matin au soir compte pour un jour, jamais zéro. */
  it('ne descend jamais sous un jour', () => {
    expect(billableDays('2026-08-22T09:00:00Z', '2026-08-22T18:00:00Z')).toBe(1)
    expect(billableDays('2026-08-22T09:00:00Z', '2026-08-22T09:00:00Z')).toBe(1)
    expect(billableDays('2026-08-22T18:00:00Z', '2026-08-22T09:00:00Z')).toBe(1)
  })
})

describe('tarification', () => {
  it('calcule sous-total, TVA et total en centimes entiers', () => {
    const pricing = priceRental({
      startAt: '2026-08-22T09:00:00Z',
      endAt: '2026-08-29T09:00:00Z',
      dailyCents: 28_000,
    })

    expect(pricing.daysBilled).toBe(7)
    expect(pricing.subtotalCents).toBe(196_000)
    expect(pricing.vatCents).toBe(39_200)
    expect(pricing.totalCents).toBe(235_200)
    // Aucun flottant ne doit franchir la frontière.
    expect(Number.isInteger(pricing.totalCents)).toBe(true)
  })

  it('applique la remise avant la TVA', () => {
    const pricing = priceRental({
      startAt: '2026-08-22T09:00:00Z',
      endAt: '2026-08-25T09:00:00Z',
      dailyCents: 30_000,
      discountCents: 15_000,
    })
    expect(pricing.subtotalCents).toBe(75_000)
    expect(pricing.vatCents).toBe(15_000)
  })

  it('ajoute les extras et ne descend jamais sous zéro', () => {
    const withExtras = priceRental({
      startAt: '2026-08-22T09:00:00Z',
      endAt: '2026-08-23T09:00:00Z',
      dailyCents: 20_000,
      extrasCents: 5_000,
    })
    expect(withExtras.subtotalCents).toBe(25_000)

    const overDiscounted = priceRental({
      startAt: '2026-08-22T09:00:00Z',
      endAt: '2026-08-23T09:00:00Z',
      dailyCents: 20_000,
      discountCents: 999_999,
    })
    expect(overDiscounted.subtotalCents).toBe(0)
    expect(overDiscounted.totalCents).toBe(0)
  })

  /** Arrondir une seule fois, à la fin : sinon le total dérive de quelques centimes. */
  it('arrondit la TVA une seule fois', () => {
    const pricing = priceRental({
      startAt: '2026-08-22T09:00:00Z',
      endAt: '2026-08-23T09:00:00Z',
      dailyCents: 33_333,
    })
    expect(pricing.vatCents).toBe(6_667)
    expect(pricing.totalCents).toBe(40_000)
  })
})

describe('chevauchement', () => {
  const existing = [
    { id: 'c1', startAt: '2026-08-20T10:00:00Z', endAt: '2026-08-24T18:00:00Z', blocking: true },
  ]

  it('détecte un chevauchement', () => {
    expect(
      findOverlap({ startAt: '2026-08-23T09:00:00Z', endAt: '2026-08-26T09:00:00Z' }, existing)?.id,
    ).toBe('c1')
    expect(
      findOverlap({ startAt: '2026-08-18T09:00:00Z', endAt: '2026-08-21T09:00:00Z' }, existing)?.id,
    ).toBe('c1')
    // Période entièrement contenue.
    expect(
      findOverlap({ startAt: '2026-08-21T09:00:00Z', endAt: '2026-08-22T09:00:00Z' }, existing)?.id,
    ).toBe('c1')
  })

  /** Un retour à 18h et un départ à 18h : c'est une rotation, pas un conflit. */
  it('autorise le contact bord à bord', () => {
    expect(
      findOverlap({ startAt: '2026-08-24T18:00:00Z', endAt: '2026-08-27T18:00:00Z' }, existing),
    ).toBeNull()
    expect(
      findOverlap({ startAt: '2026-08-18T09:00:00Z', endAt: '2026-08-20T10:00:00Z' }, existing),
    ).toBeNull()
  })

  it('ignore les contrats annulés ou clos', () => {
    const closed = [{ ...existing[0]!, blocking: false }]
    expect(
      findOverlap({ startAt: '2026-08-23T09:00:00Z', endAt: '2026-08-26T09:00:00Z' }, closed),
    ).toBeNull()
  })

  it('s’ignore lui-même lors d’une modification', () => {
    expect(
      findOverlap(
        { startAt: '2026-08-23T09:00:00Z', endAt: '2026-08-26T09:00:00Z', excludeId: 'c1' },
        existing,
      ),
    ).toBeNull()
  })
})

describe('transitions', () => {
  it('suit la machine à états du domaine', () => {
    expect(canTransition('reservation', 'active')).toBe(true)
    expect(canTransition('active', 'returned')).toBe(true)
    expect(canTransition('late', 'returned')).toBe(true)
    expect(canTransition('reservation', 'returned')).toBe(false)
    expect(canTransition('returned', 'active')).toBe(false)
    expect(canTransition('cancelled', 'active')).toBe(false)
  })

  it('refuse une transition impossible plutôt que de la laisser passer', () => {
    expect(() => assertTransition('returned', 'active')).toThrow(InvalidTransitionError)
    expect(() => assertTransition('active', 'returned')).not.toThrow()
  })
})

describe('blocages à la signature', () => {
  const base = {
    today: TODAY,
    customer: {
      licenceExpiresOn: '2028-01-01',
      isBlacklisted: false,
      blacklistReason: null,
      kind: 'individual',
    },
    vehicle: { status: 'available' },
    overlap: null,
  }

  it('laisse passer un dossier complet', () => {
    expect(checkSignature(base)).toEqual([])
  })

  /** Invariant 5 : permis expiré = bloquant. */
  it('bloque un permis expiré', () => {
    const blocks = checkSignature({
      ...base,
      customer: { ...base.customer, licenceExpiresOn: '2026-08-01' },
    })
    expect(blocks).toEqual([{ reason: 'licence_expired', expiresOn: '2026-08-01' }])
  })

  it('bloque un permis absent', () => {
    const blocks = checkSignature({
      ...base,
      customer: { ...base.customer, licenceExpiresOn: null },
    })
    expect(blocks[0]?.reason).toBe('licence_missing')
  })

  /** Une société n'a pas de permis : c'est son conducteur qui en a un. */
  it('n’exige pas de permis d’une société', () => {
    const blocks = checkSignature({
      ...base,
      customer: { ...base.customer, licenceExpiresOn: null, kind: 'company' },
    })
    expect(blocks).toEqual([])
  })

  it('bloque un client en liste noire', () => {
    const blocks = checkSignature({
      ...base,
      customer: { ...base.customer, isBlacklisted: true, blacklistReason: 'impayé' },
    })
    expect(blocks).toEqual([{ reason: 'blacklisted', note: 'impayé' }])
  })

  it('bloque un véhicule en entretien', () => {
    const blocks = checkSignature({ ...base, vehicle: { status: 'maintenance' } })
    expect(blocks[0]?.reason).toBe('vehicle_unavailable')
  })

  /** Un agent doit voir tout ce qui cloche d'un coup, pas un problème à la fois. */
  it('renvoie TOUS les blocages, pas seulement le premier', () => {
    const blocks = checkSignature({
      ...base,
      customer: { ...base.customer, licenceExpiresOn: '2026-01-01', isBlacklisted: true },
      vehicle: { status: 'out_of_service' },
    })
    expect(blocks).toHaveLength(3)
  })
})

describe('dérogation', () => {
  it('accepte une dérogation sur le permis ou la liste noire', () => {
    expect(isOverridable([{ reason: 'licence_expired', expiresOn: '2026-01-01' }])).toBe(true)
    expect(isOverridable([{ reason: 'blacklisted', note: null }])).toBe(true)
  })

  /** Le chevauchement n'est jamais négociable : la voiture n'est pas là, point. */
  it('refuse toute dérogation sur un chevauchement', () => {
    expect(isOverridable([{ reason: 'vehicle_overlap', contractId: 'c1' }])).toBe(false)
    expect(
      isOverridable([
        { reason: 'licence_expired', expiresOn: '2026-01-01' },
        { reason: 'vehicle_overlap', contractId: 'c1' },
      ]),
    ).toBe(false)
  })

  it('ne dérogera à rien quand il n’y a rien à déroger', () => {
    expect(isOverridable([])).toBe(false)
  })
})

describe('référence de contrat', () => {
  it('démarre à 1 et s’incrémente dans l’année', () => {
    expect(nextReference(2026, null)).toBe('2026-000001')
    expect(nextReference(2026, '2026-000001')).toBe('2026-000002')
    expect(nextReference(2026, '2026-000240')).toBe('2026-000241')
  })

  /** Remise à zéro chaque année, comme un carnet à souches. */
  it('repart à 1 au changement d’année', () => {
    expect(nextReference(2027, '2026-000999')).toBe('2027-000001')
  })
})
