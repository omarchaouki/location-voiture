import { describe, expect, it } from 'vitest'

import { settleReturn, type SettlementInput } from '~/core/settlement'

/**
 * LE DÉCOMPTE DE RETOUR.
 *
 * Tests à DATES FIGÉES et à montants entiers : ce module décide de ce qu'on retient
 * sur la caution d'un client, c'est-à-dire d'argent qui change de main au comptoir.
 * Chaque chiffre attendu ci-dessous est posé à la main, jamais recopié d'une exécution.
 *
 * Le contrat de référence, réutilisé partout : trois jours à 300 MAD, TVA 20 %,
 * caution de 3 000 MAD. Soit 900 MAD hors taxes, 180 de TVA, 1 080 dus.
 */

const START = '2026-08-01T09:00:00.000Z'
const PLANNED_END = '2026-08-04T09:00:00.000Z'

function contract(overrides: Partial<SettlementInput> = {}): SettlementInput {
  return {
    startAt: START,
    plannedEndAt: PLANNED_END,
    actualEndAt: PLANNED_END,
    dailyCents: 30_000,
    daysAlreadyBilled: 3,
    discountCents: 0,
    baseExtrasCents: 0,
    fuelChargeCents: 0,
    damageChargeCents: 0,
    depositCents: 300_000,
    paidCents: 108_000,
    startFuelEighths: 8,
    endFuelEighths: 8,
    startKm: 10_000,
    endKm: 10_450,
    ...overrides,
  }
}

describe('retour à l’heure, tout réglé', () => {
  const settlement = settleReturn(contract())

  it('facture les jours prévus, et pas un de plus', () => {
    expect(settlement.daysBilled).toBe(3)
    expect(settlement.lateDays).toBe(0)
    expect(settlement.totalCents).toBe(108_000)
  })

  /** LE cas courant, et celui qu'on ne veut surtout pas rater. */
  it('rend la caution entière', () => {
    expect(settlement.balanceCents).toBe(0)
    expect(settlement.depositWithheldCents).toBe(0)
    expect(settlement.depositDueBackCents).toBe(300_000)
    expect(settlement.remainingToCollectCents).toBe(0)
  })
})

describe('retour en retard', () => {
  // Rendue le 6 au lieu du 4 : cinq jours entamés au lieu de trois.
  const settlement = settleReturn(contract({ actualEndAt: '2026-08-06T09:00:00.000Z' }))

  it('facture les jours entamés en plus', () => {
    expect(settlement.daysBilled).toBe(5)
    expect(settlement.lateDays).toBe(2)
    expect(settlement.lateChargeCents).toBe(60_000)
    // 5 × 300 = 1 500 HT, 300 de TVA, 1 800 dus.
    expect(settlement.totalCents).toBe(180_000)
  })

  /**
   * La caution absorbe le retard, et le client ne repart pas en devant de l'argent.
   * C'est exactement le calcul qui se faisait de tête, et qui s'oubliait.
   */
  it('impute le retard sur la caution', () => {
    expect(settlement.balanceCents).toBe(72_000)
    expect(settlement.depositWithheldCents).toBe(72_000)
    expect(settlement.depositDueBackCents).toBe(228_000)
    expect(settlement.remainingToCollectCents).toBe(0)
  })
})

describe('retour anticipé', () => {
  /**
   * LA décision commerciale de ce module : rendre la voiture plus tôt ne rembourse
   * rien. Recalculer bêtement sur les dates réelles créditerait le client, ce qu'aucun
   * loueur ne fait — et le gérant le découvrirait sur sa trésorerie, pas dans une note.
   */
  it('ne rabote pas la facture', () => {
    const settlement = settleReturn(contract({ actualEndAt: '2026-08-02T09:00:00.000Z' }))
    expect(settlement.daysBilled).toBe(3)
    expect(settlement.lateDays).toBe(0)
    expect(settlement.totalCents).toBe(108_000)
    expect(settlement.depositDueBackCents).toBe(300_000)
  })
})

describe('carburant et dommages', () => {
  const settlement = settleReturn(
    contract({ endFuelEighths: 5, fuelChargeCents: 20_000, damageChargeCents: 50_000 }),
  )

  it('compte les huitièmes manquants', () => {
    expect(settlement.fuelShortfallEighths).toBe(3)
  })

  it('passe les frais en extras, TVA comprise', () => {
    expect(settlement.extrasCents).toBe(70_000)
    // (900 + 700) HT = 1 600, TVA 320, total 1 920.
    expect(settlement.totalCents).toBe(192_000)
    expect(settlement.balanceCents).toBe(84_000)
    expect(settlement.depositWithheldCents).toBe(84_000)
  })

  /** Une jauge inconnue au départ ne fabrique pas un manque. */
  it('ne reproche rien quand le départ n’a pas été relevé', () => {
    const unknown = settleReturn(contract({ startFuelEighths: null, endFuelEighths: 2 }))
    expect(unknown.fuelShortfallEighths).toBe(0)
  })

  /** Rendue plus pleine qu'au départ : pas de crédit non plus. */
  it('ne compte pas un excédent de carburant', () => {
    const fuller = settleReturn(contract({ startFuelEighths: 4, endFuelEighths: 8 }))
    expect(fuller.fuelShortfallEighths).toBe(0)
  })
})

describe('la caution ne suffit pas', () => {
  const settlement = settleReturn(
    contract({ depositCents: 50_000, endFuelEighths: 5, damageChargeCents: 70_000 }),
  )

  it('retient tout ce qu’elle porte, et annonce le reste', () => {
    // (900 + 700) HT = 1 600, TVA 320, total 1 920, déjà réglé 1 080 → 840 dus.
    expect(settlement.balanceCents).toBe(84_000)
    expect(settlement.depositWithheldCents).toBe(50_000)
    expect(settlement.depositDueBackCents).toBe(0)
    expect(settlement.remainingToCollectCents).toBe(34_000)
  })
})

describe('la retenue décidée par l’agent', () => {
  /**
   * On ne retient JAMAIS plus que ce qu'on détient. La borne est ici, dans le module
   * pur appelé par le serveur — pas dans l'écran, qui ne protège personne.
   */
  it('ne dépasse pas la caution', () => {
    const settlement = settleReturn(contract(), 99_999_900)
    expect(settlement.depositWithheldCents).toBe(300_000)
    expect(settlement.depositDueBackCents).toBe(0)
  })

  it('ne descend pas sous zéro', () => {
    const settlement = settleReturn(contract(), -5_000)
    expect(settlement.depositWithheldCents).toBe(0)
  })

  /** Geste commercial : on ne retient rien malgré un solde dû, et on le dit. */
  it('laisse le solde à encaisser quand l’agent ne retient rien', () => {
    const settlement = settleReturn(contract({ actualEndAt: '2026-08-06T09:00:00.000Z' }), 0)
    expect(settlement.suggestedWithheldCents).toBe(72_000)
    expect(settlement.depositWithheldCents).toBe(0)
    expect(settlement.depositDueBackCents).toBe(300_000)
    expect(settlement.remainingToCollectCents).toBe(72_000)
  })
})

describe('trop-perçu', () => {
  /** Le client a versé plus que dû : la caution reste entière et on lui doit la différence. */
  it('annonce un remboursement, pas une retenue', () => {
    const settlement = settleReturn(contract({ paidCents: 150_000 }))
    expect(settlement.balanceCents).toBe(-42_000)
    expect(settlement.depositWithheldCents).toBe(0)
    expect(settlement.depositDueBackCents).toBe(300_000)
    expect(settlement.refundDueCents).toBe(42_000)
    expect(settlement.remainingToCollectCents).toBe(0)
  })
})

describe('kilométrage', () => {
  it('compte les kilomètres parcourus', () => {
    expect(settleReturn(contract()).kmDriven).toBe(450)
  })

  it('ne conclut rien sans relevé de départ', () => {
    expect(settleReturn(contract({ startKm: null })).kmDriven).toBeNull()
  })
})
