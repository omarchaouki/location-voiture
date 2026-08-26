import { describe, expect, it } from 'vitest'

import { attachFine, canRebill, type FineCandidate } from '~/core/fines'

/**
 * Rattachement d'une amende au conducteur.
 *
 * C'est la règle la plus dangereuse du produit : se tromper, c'est facturer une
 * contravention au mauvais client. Chaque test correspond à une situation réelle de
 * comptoir.
 */

function contract(overrides: Partial<FineCandidate> = {}): FineCandidate {
  return {
    id: 'c1',
    reference: '2026-000241',
    customerId: 'k1',
    customerLabel: 'Youssef Benali',
    startAt: '2026-08-20T10:00:00.000Z',
    endAt: '2026-08-24T18:00:00.000Z',
    status: 'returned',
    ...overrides,
  }
}

describe('rattachement', () => {
  it('rattache une infraction commise pendant la location', () => {
    const result = attachFine('2026-08-22T14:30:00.000Z', [contract()])
    expect(result.kind).toBe('attached')
    if (result.kind === 'attached') {
      expect(result.contract.customerLabel).toBe('Youssef Benali')
    }
  })

  /** Bornes inclusives : une infraction à la minute du départ est bien du client. */
  it('inclut les bornes', () => {
    expect(attachFine('2026-08-20T10:00:00.000Z', [contract()]).kind).toBe('attached')
    expect(attachFine('2026-08-24T18:00:00.000Z', [contract()]).kind).toBe('attached')
  })

  it('ne rattache rien hors de la période', () => {
    expect(attachFine('2026-08-19T23:59:00.000Z', [contract()]).kind).toBe('none')
    expect(attachFine('2026-08-24T18:00:01.000Z', [contract()]).kind).toBe('none')
  })

  /** Un contrat encore ouvert couvre tout ce qui suit son départ. */
  it('couvre un contrat encore ouvert', () => {
    const open = contract({ endAt: null, status: 'active' })
    expect(attachFine('2026-09-15T08:00:00.000Z', [open]).kind).toBe('attached')
    expect(attachFine('2026-08-19T08:00:00.000Z', [open]).kind).toBe('none')
  })

  it('ignore un contrat annulé ou en simple réservation', () => {
    expect(
      attachFine('2026-08-22T14:30:00.000Z', [contract({ status: 'cancelled' })]).kind,
    ).toBe('none')
    expect(
      attachFine('2026-08-22T14:30:00.000Z', [contract({ status: 'reservation' })]).kind,
    ).toBe('none')
  })

  /**
   * Le cas qui compte : deux contrats se recouvrent (saisie manuelle, correction
   * bâclée). On ne choisit PAS — on demande.
   */
  it('refuse de choisir quand plusieurs contrats se recouvrent', () => {
    const result = attachFine('2026-08-22T14:30:00.000Z', [
      contract({ id: 'c1' }),
      contract({ id: 'c2', customerId: 'k2', customerLabel: 'Fatima Z.' }),
    ])

    expect(result.kind).toBe('ambiguous')
    if (result.kind === 'ambiguous') {
      expect(result.candidates).toHaveLength(2)
    }
  })

  it('choisit le bon contrat parmi plusieurs qui ne se recouvrent pas', () => {
    const result = attachFine('2026-09-02T09:00:00.000Z', [
      contract({ id: 'c1' }),
      contract({
        id: 'c2',
        customerId: 'k2',
        customerLabel: 'Fatima Z.',
        startAt: '2026-09-01T10:00:00.000Z',
        endAt: '2026-09-05T18:00:00.000Z',
      }),
    ])

    expect(result.kind).toBe('attached')
    if (result.kind === 'attached') expect(result.contract.id).toBe('c2')
  })

  it('ne tombe pas sur une date illisible', () => {
    expect(attachFine('pas une date', [contract()]).kind).toBe('none')
  })

  it('ne rattache rien quand le véhicule n’a jamais été loué', () => {
    expect(attachFine('2026-08-22T14:30:00.000Z', []).kind).toBe('none')
  })
})

describe('refacturation', () => {
  it('exige un rattachement', () => {
    expect(canRebill({ contractId: 'c1', status: 'open' })).toBe(true)
    // Sans contrat, refacturer reviendrait à choisir un client au hasard.
    expect(canRebill({ contractId: null, status: 'open' })).toBe(false)
  })

  it('ne refacture pas deux fois', () => {
    expect(canRebill({ contractId: 'c1', status: 'rebilled' })).toBe(false)
  })
})
