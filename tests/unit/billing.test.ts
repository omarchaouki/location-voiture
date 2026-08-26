import { describe, expect, it } from 'vitest'

import {
  allowsBusinessWrites,
  checkQuota,
  effectiveStatus,
  invoiceTotals,
  isConsecutive,
  nextInvoiceNumber,
  subtotalFromTotal,
  type SubscriptionState,
} from '~/core/billing'

/**
 * Abonnement et facturation.
 *
 * Tests à DATES FIGÉES : le cycle de vie d'un abonnement parle de « sept jours après
 * l'échéance », et c'est exactement le genre de règle qu'on ne peut pas éprouver en
 * lisant l'horloge.
 */

describe('TVA', () => {
  it('calcule 20 % sur un montant en centimes', () => {
    expect(invoiceTotals(100_000)).toEqual({
      subtotalCents: 100_000,
      vatCents: 20_000,
      totalCents: 120_000,
    })
  })

  /**
   * LE test qui justifie les centimes entiers : en flottant, `19.99 * 0.2` vaut
   * 3.9979999999999998, et la facture affiche un centime de travers.
   */
  it('ne perd pas de centime sur un montant qui tombe mal', () => {
    const totals = invoiceTotals(1_999)
    expect(totals.vatCents).toBe(400)
    expect(totals.totalCents).toBe(2_399)
    // Le total est la SOMME des deux, jamais un troisième arrondi.
    expect(totals.subtotalCents + totals.vatCents).toBe(totals.totalCents)
  })

  it('retrouve le hors-taxes depuis un prix TTC', () => {
    expect(subtotalFromTotal(120_000)).toBe(100_000)
    expect(invoiceTotals(subtotalFromTotal(2_399)).totalCents).toBeCloseTo(2_399, -1)
  })

  it('accepte un autre taux sans toucher au reste', () => {
    expect(invoiceTotals(100_000, 700).vatCents).toBe(7_000)
    expect(invoiceTotals(100_000, 0).totalCents).toBe(100_000)
  })
})

describe('numéro de facture', () => {
  it('commence à 1 et s’incrémente', () => {
    expect(nextInvoiceNumber(2026, null)).toBe('2026-000001')
    expect(nextInvoiceNumber(2026, '2026-000001')).toBe('2026-000002')
    expect(nextInvoiceNumber(2026, '2026-000241')).toBe('2026-000242')
  })

  it('repart à 1 au changement d’année', () => {
    expect(nextInvoiceNumber(2027, '2026-000241')).toBe('2027-000001')
  })

  /** L'invariant 9 : une série sans trou. Le test le vérifie sur mille numéros. */
  it('produit une série continue', () => {
    let previous = nextInvoiceNumber(2026, null)
    for (let index = 0; index < 1_000; index += 1) {
      const next = nextInvoiceNumber(2026, previous)
      expect(isConsecutive(previous, next)).toBe(true)
      previous = next
    }
    expect(previous).toBe('2026-001001')
  })

  it('détecte un trou', () => {
    expect(isConsecutive('2026-000001', '2026-000003')).toBe(false)
  })
})

describe('quotas', () => {
  const starter = { maxVehicles: 10, maxUsers: 3, maxBranches: 1 }

  it('laisse passer tant qu’il reste de la place', () => {
    expect(checkQuota('vehicles', 9, starter).allowed).toBe(true)
  })

  it('refuse à la limite, pas au-delà', () => {
    // Neuf véhicules : le dixième passe. Dix : le onzième est refusé.
    expect(checkQuota('vehicles', 10, starter).allowed).toBe(false)
    expect(checkQuota('vehicles', 10, starter).limit).toBe(10)
  })

  /** `null` = illimité. L'inverse bloquerait précisément les offres hautes. */
  it('traite `null` comme illimité et non comme zéro', () => {
    const business = { maxVehicles: null, maxUsers: null, maxBranches: null }
    expect(checkQuota('vehicles', 4_000, business).allowed).toBe(true)
    expect(checkQuota('users', 0, business).limit).toBeNull()
  })
})

describe('cycle de vie de l’abonnement', () => {
  const base: SubscriptionState = {
    status: 'active',
    trialEndsOn: null,
    periodEndsOn: '2026-08-31',
    graceUntilOn: null,
    cancelAtPeriodEnd: false,
  }

  it('reste actif tant que la période est payée', () => {
    expect(effectiveStatus(base, '2026-08-31')).toBe('active')
  })

  /**
   * La règle qui coûte cher dans les deux sens : un virement marocain met trois à
   * cinq jours ouvrés. Couper au deuxième jour bloque des clients qui ont payé.
   */
  it('accorde sept jours de grâce après l’échéance', () => {
    expect(effectiveStatus(base, '2026-09-01')).toBe('past_due')
    expect(effectiveStatus(base, '2026-09-07')).toBe('past_due')
    expect(effectiveStatus(base, '2026-09-08')).toBe('read_only')
  })

  it('pendant la grâce, le client travaille encore', () => {
    expect(allowsBusinessWrites('past_due')).toBe(true)
    expect(allowsBusinessWrites('read_only')).toBe(false)
    expect(allowsBusinessWrites('cancelled')).toBe(false)
  })

  it('bascule un essai expiré en lecture seule', () => {
    const trial: SubscriptionState = {
      ...base,
      status: 'trialing',
      trialEndsOn: '2026-08-20',
      periodEndsOn: null,
    }
    expect(effectiveStatus(trial, '2026-08-20')).toBe('trialing')
    expect(effectiveStatus(trial, '2026-08-21')).toBe('read_only')
  })

  /** Une résiliation demandée ne coupe pas l'accès avant le terme déjà payé. */
  it('laisse une résiliation courir jusqu’au terme', () => {
    const leaving: SubscriptionState = { ...base, cancelAtPeriodEnd: true }
    expect(effectiveStatus(leaving, '2026-08-31')).toBe('active')
    expect(effectiveStatus(leaving, '2026-09-01')).toBe('cancelled')
  })

  it('une annulation effective ne se rouvre jamais toute seule', () => {
    expect(effectiveStatus({ ...base, status: 'cancelled' }, '2020-01-01')).toBe('cancelled')
  })

  it('respecte une grâce négociée plus longue que la grâce par défaut', () => {
    const negotiated: SubscriptionState = { ...base, graceUntilOn: '2026-09-30' }
    expect(effectiveStatus(negotiated, '2026-09-20')).toBe('past_due')
    expect(effectiveStatus(negotiated, '2026-10-01')).toBe('read_only')
  })
})
