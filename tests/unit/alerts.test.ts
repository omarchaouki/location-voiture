import { describe, expect, it } from 'vitest'

import { evaluateAlerts, identityOf, type AlertSnapshot } from '~/core/alerts'

/**
 * LE moteur d'alertes.
 *
 * Tous les tests sont à DATES FIGÉES : aucun ne dépend de l'horloge. C'est la seule
 * façon de tester des règles qui parlent de « J-30 » sans que la suite change de
 * comportement selon le jour où on la lance.
 */

const TODAY = '2026-08-22'
const NOW = '2026-08-22T09:00:00.000Z'

function snapshot(overrides: Partial<AlertSnapshot> = {}): AlertSnapshot {
  return {
    today: TODAY,
    now: NOW,
    vehicles: [
      { id: 'v1', plate: '12345|أ|6', label: 'Dacia Logan', currentKm: 91_340, status: 'available' },
    ],
    geofenceExits: [],
    gpsMovements: [],
    insurance: [],
    inspections: [],
    roadTaxes: [],
    permits: [],
    maintenance: [],
    contracts: [],
    customers: [],
    ...overrides,
  }
}

describe('idempotence', () => {
  /** Le point le plus important du moteur : le relancer ne doit rien changer. */
  it('deux évaluations sur les mêmes données donnent exactement le même résultat', () => {
    const input = snapshot({
      insurance: [{ id: 'i1', vehicleId: 'v1', expiresOn: '2026-09-05' }],
      inspections: [{ id: 't1', vehicleId: 'v1', expiresOn: '2026-08-20' }],
      roadTaxes: [{ id: 'r1', vehicleId: 'v1', year: 2026, paidAt: null }],
    })

    expect(evaluateAlerts(input)).toEqual(evaluateAlerts(input))
  })

  it('n’émet jamais deux fois la même identité', () => {
    const drafts = evaluateAlerts(
      snapshot({
        insurance: [
          { id: 'i1', vehicleId: 'v1', expiresOn: '2026-09-05' },
          { id: 'i2', vehicleId: 'v1', expiresOn: '2026-09-05' },
        ],
      }),
    )
    const identities = drafts.map(identityOf)
    expect(new Set(identities).size).toBe(identities.length)
  })
})

describe('assurance', () => {
  it('reste silencieuse tant que l’échéance est lointaine', () => {
    const drafts = evaluateAlerts(
      snapshot({ insurance: [{ id: 'i1', vehicleId: 'v1', expiresOn: '2027-03-14' }] }),
    )
    expect(drafts).toHaveLength(0)
  })

  it('émet le seuil COURANT, pas tous les seuils franchis', () => {
    // À 10 jours, avec les seuils [30, 14, 7, 1], le seuil courant est 14.
    const drafts = evaluateAlerts(
      snapshot({ insurance: [{ id: 'i1', vehicleId: 'v1', expiresOn: '2026-09-01' }] }),
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.thresholdKey).toBe('d-14')
  })

  it('passe à d-0 le jour même, puis à overdue', () => {
    expect(
      evaluateAlerts(snapshot({ insurance: [{ id: 'i', vehicleId: 'v1', expiresOn: TODAY }] }))[0]
        ?.thresholdKey,
    ).toBe('d-0')

    expect(
      evaluateAlerts(
        snapshot({ insurance: [{ id: 'i', vehicleId: 'v1', expiresOn: '2026-08-01' }] }),
      )[0]?.thresholdKey,
    ).toBe('overdue')
  })

  /**
   * É5 — sans `periodKey`, une alerte résolue ne pourrait jamais réapparaître.
   * C'est le test qui protège la deuxième année de production.
   */
  it('change de période quand la police est renouvelée', () => {
    const before = evaluateAlerts(
      snapshot({ insurance: [{ id: 'i1', vehicleId: 'v1', expiresOn: '2026-09-01' }] }),
    )
    const after = evaluateAlerts(
      snapshot({
        today: '2027-08-22',
        insurance: [{ id: 'i2', vehicleId: 'v1', expiresOn: '2027-09-01' }],
      }),
    )

    expect(before[0]?.periodKey).toBe('2026-09-01')
    expect(after[0]?.periodKey).toBe('2027-09-01')
    expect(identityOf(before[0]!)).not.toBe(identityOf(after[0]!))
  })
})

describe('vignette', () => {
  it('ouvre la campagne au 1er janvier et l’escalade jusqu’à la fin du mois', () => {
    const at = (today: string) =>
      evaluateAlerts(
        snapshot({ today, roadTaxes: [{ id: 'r', vehicleId: 'v1', year: 2026, paidAt: null }] }),
      )[0]

    expect(at('2026-01-02')?.thresholdKey).toBe('window-open')
    expect(at('2026-01-20')?.thresholdKey).toBe('window-mid')
    expect(at('2026-01-30')?.thresholdKey).toBe('window-end')
    expect(at('2026-02-15')?.thresholdKey).toBe('overdue')
    // Passée la fenêtre, ce n'est plus un rappel : c'est une infraction.
    expect(at('2026-02-15')?.severity).toBe('critical')
  })

  it('se tait dès que la vignette est payée', () => {
    const drafts = evaluateAlerts(
      snapshot({ roadTaxes: [{ id: 'r', vehicleId: 'v1', year: 2026, paidAt: '2026-01-18' }] }),
    )
    expect(drafts).toHaveLength(0)
  })

  it('utilise l’ANNÉE comme période, pour rouvrir la campagne suivante', () => {
    const draft = evaluateAlerts(
      snapshot({ roadTaxes: [{ id: 'r', vehicleId: 'v1', year: 2026, paidAt: null }] }),
    )[0]
    expect(draft?.periodKey).toBe('2026')
  })
})

describe('entretien', () => {
  it('prévient à 1000, 500 puis 200 km', () => {
    const at = (nextDueKm: number) =>
      evaluateAlerts(
        snapshot({
          maintenance: [
            { id: 'm', vehicleId: 'v1', kind: 'oil_change', nextDueOn: null, nextDueKm },
          ],
        }),
      )[0]

    expect(at(93_000)).toBeUndefined() // 1660 km : trop tôt
    expect(at(92_200)?.thresholdKey).toBe('km-1000')
    expect(at(91_700)?.thresholdKey).toBe('km-500')
    expect(at(91_500)?.thresholdKey).toBe('km-200')
    expect(at(91_000)?.thresholdKey).toBe('km-0')
  })

  it('escalade en critique une fois l’échéance kilométrique dépassée', () => {
    const draft = evaluateAlerts(
      snapshot({
        maintenance: [
          { id: 'm', vehicleId: 'v1', kind: 'oil_change', nextDueOn: null, nextDueKm: 90_000 },
        ],
      }),
    )[0]
    expect(draft?.severity).toBe('critical')
    expect(draft?.payload?.['remainingKm']).toBe(-1340)
  })

  /** Voiture peu roulée : c'est la borne de TEMPS qui la rattrape. */
  it('rattrape un véhicule immobilisé par la borne de temps', () => {
    const draft = evaluateAlerts(
      snapshot({
        maintenance: [
          { id: 'm', vehicleId: 'v1', kind: 'oil_change', nextDueOn: '2026-09-10', nextDueKm: 200_000 },
        ],
      }),
    )[0]
    expect(draft?.thresholdKey).toBe('d-30')
  })

  it('ignore un entretien dont le véhicule a disparu', () => {
    const drafts = evaluateAlerts(
      snapshot({
        maintenance: [
          { id: 'm', vehicleId: 'inconnu', kind: 'oil_change', nextDueOn: null, nextDueKm: 0 },
        ],
      }),
    )
    expect(drafts).toHaveLength(0)
  })
})

describe('contrats', () => {
  const base = {
    id: 'c1',
    reference: '2026-000241',
    vehicleId: 'v1',
    startAt: '2026-08-20T09:00:00.000Z',
    status: 'active',
    depositCents: 300_000,
    depositReturnedAt: null,
  }

  it('prévient la veille et le jour du retour', () => {
    const veille = evaluateAlerts(
      snapshot({
        contracts: [{ ...base, plannedEndAt: '2026-08-23T18:00:00.000Z', actualEndAt: null }],
      }),
    ).find((draft) => draft.alertType === 'contract.ending')
    expect(veille?.thresholdKey).toBe('d-1')

    const jourJ = evaluateAlerts(
      snapshot({
        contracts: [{ ...base, plannedEndAt: '2026-08-22T18:00:00.000Z', actualEndAt: null }],
      }),
    ).find((draft) => draft.alertType === 'contract.ending')
    expect(jourJ?.thresholdKey).toBe('d-0')
  })

  it('constate le retard par tranches de 3 heures, plafonné à 72 h', () => {
    const late = (plannedEndAt: string) =>
      evaluateAlerts(
        snapshot({ contracts: [{ ...base, plannedEndAt, actualEndAt: null }] }),
      ).find((draft) => draft.alertType === 'contract.late')

    expect(late('2026-08-22T08:00:00.000Z')).toBeUndefined() // 1 h : pas encore
    expect(late('2026-08-22T05:00:00.000Z')?.thresholdKey).toBe('late-3h')
    expect(late('2026-08-21T20:00:00.000Z')?.thresholdKey).toBe('late-12h')
    // Un contrat oublié un mois ne doit pas produire 240 lignes.
    expect(late('2026-07-01T09:00:00.000Z')?.thresholdKey).toBe('late-72h')
  })

  it('signale une caution non restituée 48 h après le retour', () => {
    const drafts = evaluateAlerts(
      snapshot({
        contracts: [
          {
            ...base,
            status: 'returned',
            plannedEndAt: '2026-08-18T18:00:00.000Z',
            actualEndAt: '2026-08-19T18:00:00.000Z',
          },
        ],
      }),
    )
    const deposit = drafts.find((draft) => draft.alertType === 'deposit.pending')
    expect(deposit?.thresholdKey).toBe('h-48')
    expect(deposit?.payload?.['amountCents']).toBe(300_000)
  })

  it('se tait si la caution a été rendue', () => {
    const drafts = evaluateAlerts(
      snapshot({
        contracts: [
          {
            ...base,
            status: 'returned',
            plannedEndAt: '2026-08-18T18:00:00.000Z',
            actualEndAt: '2026-08-19T18:00:00.000Z',
            depositReturnedAt: '2026-08-20T10:00:00.000Z',
          },
        ],
      }),
    )
    expect(drafts.filter((draft) => draft.alertType === 'deposit.pending')).toHaveLength(0)
  })
})

describe('permis du client', () => {
  it('est bloquant, et le reste une fois expiré', () => {
    const draft = evaluateAlerts(
      snapshot({
        customers: [{ id: 'k1', label: 'Youssef B.', licenceExpiresOn: '2026-08-01' }],
      }),
    )[0]
    expect(draft?.severity).toBe('blocking')
    expect(draft?.thresholdKey).toBe('expired')
  })

  it('ignore un client sans permis renseigné', () => {
    const drafts = evaluateAlerts(
      snapshot({ customers: [{ id: 'k1', label: 'Société X', licenceExpiresOn: null }] }),
    )
    expect(drafts).toHaveLength(0)
  })
})

describe('Ramadan', () => {
  /**
   * Le Maroc repasse à UTC+0 pendant le Ramadan (docs/DECISIONS.md É7). Le moteur ne
   * lit jamais l'horloge : il reçoit `today` et `now`. Ce test vérifie qu'une date
   * civile de Ramadan se comporte comme n'importe quelle autre — c'est l'APPELANT qui
   * doit calculer `today` en heure de Casablanca, et il est testé ailleurs.
   */
  it('traite une date de Ramadan comme une date ordinaire', () => {
    const drafts = evaluateAlerts(
      snapshot({
        today: '2026-03-01',
        now: '2026-03-01T08:00:00.000Z',
        insurance: [{ id: 'i', vehicleId: 'v1', expiresOn: '2026-03-08' }],
      }),
    )
    expect(drafts[0]?.thresholdKey).toBe('d-7')
  })
})

describe('GPS — sortie de zone', () => {
  const exit = {
    id: 'e1',
    vehicleId: 'v1',
    geofenceName: 'Grand Casablanca',
    occurredAt: '2026-08-22T03:12:00.000Z',
    onDay: '2026-08-22',
  }

  it('transforme un franchissement constaté en alerte', () => {
    const draft = evaluateAlerts(snapshot({ geofenceExits: [exit] })).find(
      (candidate) => candidate.alertType === 'gps.geofence_exit',
    )

    expect(draft?.severity).toBe('high')
    expect(draft?.entityId).toBe('v1')
    expect(draft?.payload?.['zone']).toBe('Grand Casablanca')
  })

  /**
   * Deux sorties de la MÊME zone le même jour sont deux faits distincts : la période
   * est l'identifiant de l'événement, pas le jour. Regrouper reviendrait à cacher la
   * seconde sortie — celle qu'on voudrait justement voir.
   */
  it('émet une alerte par franchissement, pas une par jour', () => {
    const drafts = evaluateAlerts(
      snapshot({
        geofenceExits: [exit, { ...exit, id: 'e2', occurredAt: '2026-08-22T19:40:00.000Z' }],
      }),
    ).filter((draft) => draft.alertType === 'gps.geofence_exit')

    expect(drafts).toHaveLength(2)
    expect(new Set(drafts.map(identityOf)).size).toBe(2)
  })
})

describe('GPS — usage hors contrat', () => {
  const movement = { vehicleId: 'v1', at: '2026-08-22T05:20:00.000Z', onDay: '2026-08-22', speedKmh: 68 }

  const rental = {
    id: 'c9',
    reference: '2026-000112',
    vehicleId: 'v1',
    startAt: '2026-08-21T10:00:00.000Z',
    plannedEndAt: '2026-08-25T10:00:00.000Z',
    actualEndAt: null,
    status: 'active',
    depositCents: 0,
    depositReturnedAt: null,
  }

  it('signale une voiture qui roule sans contrat', () => {
    const draft = evaluateAlerts(snapshot({ gpsMovements: [movement] })).find(
      (candidate) => candidate.alertType === 'gps.unauthorized_use',
    )

    expect(draft?.severity).toBe('high')
    expect(draft?.periodKey).toBe('2026-08-22')
    expect(draft?.payload?.['speedKmh']).toBe(68)
  })

  it('se tait quand un contrat couvre l’instant du mouvement', () => {
    const drafts = evaluateAlerts(
      snapshot({ gpsMovements: [movement], contracts: [rental] }),
    ).filter((draft) => draft.alertType === 'gps.unauthorized_use')

    expect(drafts).toEqual([])
  })

  /**
   * Un retour en retard n'est PAS un usage hors contrat : le contrat court tant que
   * les clés ne sont pas rendues. Prendre la fin PRÉVUE comme borne ferait doublonner
   * chaque retard avec une alerte de vol présumé.
   */
  it('ne confond pas un retard avec un usage hors contrat', () => {
    const drafts = evaluateAlerts(
      snapshot({
        gpsMovements: [{ ...movement, at: '2026-08-26T05:20:00.000Z', onDay: '2026-08-26' }],
        contracts: [rental],
      }),
    ).filter((draft) => draft.alertType === 'gps.unauthorized_use')

    expect(drafts).toEqual([])
  })

  /** Un passage à l'atelier est un déplacement légitime, et fréquent. */
  it('exclut une voiture en entretien', () => {
    const drafts = evaluateAlerts(
      snapshot({
        vehicles: [
          { id: 'v1', plate: '12345|أ|6', label: 'Dacia Logan', currentKm: 91_340, status: 'maintenance' },
        ],
        gpsMovements: [movement],
      }),
    ).filter((draft) => draft.alertType === 'gps.unauthorized_use')

    expect(drafts).toEqual([])
  })

  it('ne produit qu’une alerte par jour civil, même sur trois cents relevés', () => {
    const drafts = evaluateAlerts(
      snapshot({
        gpsMovements: Array.from({ length: 300 }, (_, index) => ({
          vehicleId: 'v1',
          at: new Date(Date.UTC(2026, 7, 22, 5, index % 60)).toISOString(),
          onDay: '2026-08-22',
          speedKmh: 60,
        })),
      }),
    ).filter((draft) => draft.alertType === 'gps.unauthorized_use')

    expect(drafts).toHaveLength(1)
  })
})
