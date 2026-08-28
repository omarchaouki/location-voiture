import { describe, expect, it } from 'vitest'

import { limitCovers, planCovers, recommendPlan, type FittablePlan } from '~/core/plan-fit'

/**
 * La règle qui répond au questionnaire de la page d'accueil.
 *
 * Elle est testée sur un catalogue FABRIQUÉ, jamais sur celui du produit : le jour où
 * le commercial déplace une limite en base, ces tests doivent continuer à décrire la
 * règle et non le catalogue du moment. C'est aussi ce qui vérifie qu'aucun code
 * d'offre n'est câblé quelque part — les codes utilisés ici n'existent pas ailleurs.
 */

const CATALOG: FittablePlan[] = [
  {
    code: 'essai',
    monthlyCents: 0,
    maxVehicles: 5,
    maxUsers: 2,
    maxBranches: 1,
    trialDays: 14,
    features: ['gps.track', 'gps.geofence'],
  },
  {
    code: 'petite',
    monthlyCents: 29_900,
    maxVehicles: 10,
    maxUsers: 3,
    maxBranches: 1,
    trialDays: 0,
    features: [],
  },
  {
    code: 'moyenne',
    monthlyCents: 79_900,
    maxVehicles: 40,
    maxUsers: 10,
    maxBranches: 3,
    trialDays: 0,
    features: ['gps.track', 'gps.geofence'],
  },
  {
    code: 'grande',
    monthlyCents: 149_900,
    maxVehicles: null,
    maxUsers: null,
    maxBranches: null,
    trialDays: 0,
    features: ['gps.track', 'gps.geofence'],
  },
]

const NO_NEED = { vehicles: 1, users: 1, branches: 1, features: [] as string[] }

describe('limitCovers', () => {
  it('illimité couvre tout', () => {
    expect(limitCovers(null, 5)).toBe(true)
    expect(limitCovers(null, null)).toBe(true)
  })

  it('un besoin illimité ne se laisse couvrir que par de l’illimité', () => {
    // Le piège du questionnaire : « plus de 40 voitures » ne doit JAMAIS tomber sur
    // l'offre plafonnée à 40, même si c'est la plus grande valeur du catalogue.
    expect(limitCovers(40, null)).toBe(false)
    expect(limitCovers(1_000_000, null)).toBe(false)
  })

  it('compare les nombres, bornes incluses', () => {
    expect(limitCovers(10, 10)).toBe(true)
    expect(limitCovers(10, 11)).toBe(false)
  })
})

describe('planCovers', () => {
  it('exige TOUTES les fonctionnalités demandées', () => {
    const petite = CATALOG[1]!
    expect(planCovers(petite, { ...NO_NEED, features: ['gps.track'] })).toBe(false)
    expect(planCovers(petite, NO_NEED)).toBe(true)
  })

  it('une seule limite dépassée suffit à écarter une offre', () => {
    const moyenne = CATALOG[2]!
    expect(planCovers(moyenne, { ...NO_NEED, vehicles: 40, users: 10, branches: 3 })).toBe(true)
    expect(planCovers(moyenne, { ...NO_NEED, branches: 4 })).toBe(false)
  })
})

describe('recommendPlan', () => {
  it('conseille la moins chère qui convient', () => {
    const { plan, approximate } = recommendPlan(CATALOG, {
      vehicles: 10,
      users: 3,
      branches: 1,
      features: [],
    })
    expect(plan?.code).toBe('petite')
    expect(approximate).toBe(false)
  })

  it('écarte les offres d’ESSAI du conseil, et les rend à part', () => {
    // Trois voitures, deux utilisateurs : l'essai gratuit couvre et coûte zéro. Il
    // gagnerait tout classement par prix — c'est exactement ce qu'on ne veut pas.
    const { plan, trial } = recommendPlan(CATALOG, {
      vehicles: 3,
      users: 2,
      branches: 1,
      features: [],
    })
    expect(plan?.code).toBe('petite')
    expect(trial?.code).toBe('essai')
  })

  it('monte d’offre quand une fonctionnalité manque, pas quand une limite suffit', () => {
    const { plan } = recommendPlan(CATALOG, {
      vehicles: 8,
      users: 2,
      branches: 1,
      features: ['gps.track'],
    })
    // Les limites tenaient dans « petite » ; c'est le GPS qui fait monter.
    expect(plan?.code).toBe('moyenne')
  })

  it('n’annonce pas d’essai quand l’essai ne couvre pas le besoin', () => {
    const { trial } = recommendPlan(CATALOG, {
      vehicles: 30,
      users: 2,
      branches: 1,
      features: [],
    })
    expect(trial).toBeNull()
  })

  it('rend la plus large et le SIGNALE quand rien ne couvre', () => {
    const bornedCatalog = CATALOG.filter((plan) => plan.code !== 'grande')
    const { plan, approximate } = recommendPlan(bornedCatalog, {
      vehicles: null,
      users: null,
      branches: null,
      features: [],
    })
    expect(plan?.code).toBe('moyenne')
    expect(approximate).toBe(true)
  })

  it('ne se casse pas sur un catalogue vide', () => {
    const { plan, approximate, trial } = recommendPlan([], NO_NEED)
    expect(plan).toBeNull()
    expect(approximate).toBe(false)
    expect(trial).toBeNull()
  })
})
