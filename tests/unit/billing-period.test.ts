import { describe, expect, it } from 'vitest'

import {
  BILLING_PERIODS,
  DEFAULT_BILLING_PERIOD,
  displayedMonthlyCents,
  monthlyEquivalentCents,
  monthsFreeOnYearly,
  yearlySavingsCents,
} from '~/core/billing'

/**
 * MENSUEL OU ANNUEL — l'arithmétique de la page tarifaire.
 *
 * Ces fonctions existent pour une seule raison : la remise annoncée sur la vitrine ne
 * doit JAMAIS être écrite dans le JSX. « Deux mois offerts » est une conséquence du
 * catalogue, pas une constante du produit — le jour où la grille tarifaire change, la
 * page doit changer avec elle, sans qu'on ait à s'en souvenir.
 *
 * D'où ces tests : ils éprouvent la RÈGLE, pas les valeurs du catalogue actuel.
 */

describe('mois offerts sur l’engagement annuel', () => {
  /** Le catalogue pose `yearlyCents = monthlyCents × 10`. Douze mois payés dix. */
  it('rend deux mois quand l’année vaut dix mensualités', () => {
    expect(monthsFreeOnYearly(79_900, 799_000)).toBe(2)
  })

  it('suit le catalogue plutôt qu’une constante écrite quelque part', () => {
    // Douze mois payés neuf : trois offerts, sans qu'une ligne de code ne le sache.
    expect(monthsFreeOnYearly(79_900, 719_100)).toBe(3)
    // Douze mois payés douze : rien d'offert, et la page ne promet donc rien.
    expect(monthsFreeOnYearly(79_900, 958_800)).toBe(0)
  })

  /**
   * Un annuel PLUS CHER que douze mensualités ne promet pas « -1 mois ».
   *
   * Le cas paraît absurde et c'est justement pourquoi il est testé : il ne viendra pas
   * d'une décision commerciale mais d'une faute de frappe en base, et une vitrine qui
   * annonce une remise négative est pire qu'une vitrine qui se tait.
   */
  it('ne promet rien quand l’annuel n’est pas avantageux', () => {
    expect(monthsFreeOnYearly(79_900, 1_200_000)).toBe(0)
  })

  /** Une offre gratuite n'a pas de remise à annoncer, et surtout pas de division par zéro. */
  it('reste à zéro sur une offre gratuite', () => {
    expect(monthsFreeOnYearly(0, 0)).toBe(0)
    expect(monthsFreeOnYearly(0, 10_000)).toBe(0)
  })
})

describe('économie annoncée', () => {
  it('vaut douze mensualités moins le prix de l’année', () => {
    expect(yearlySavingsCents(79_900, 799_000)).toBe(159_800)
  })

  /** Jamais négative : voir ci-dessus, c'est la même faute de frappe. */
  it('ne descend jamais sous zéro', () => {
    expect(yearlySavingsCents(79_900, 1_200_000)).toBe(0)
  })
})

describe('prix ramené au mois', () => {
  /**
   * C'est le nombre affiché sous l'annuel, et le seul qui se compare au mensuel.
   * L'arrondi tombe au centime — le total annoncé pour l'année reste `yearlyCents`,
   * qu'on n'obtient pas en multipliant celui-ci par douze.
   */
  it('divise l’année par douze, au centime', () => {
    expect(monthlyEquivalentCents(799_000)).toBe(66_583)
  })

  it('arrondit au plus proche, jamais vers le bas par défaut', () => {
    // 100_006 / 12 = 8333,83… → 8334, et non 8333.
    expect(monthlyEquivalentCents(100_006)).toBe(8_334)
  })

  it('choisit la bonne source selon le rythme', () => {
    expect(displayedMonthlyCents('monthly', 79_900, 799_000)).toBe(79_900)
    expect(displayedMonthlyCents('yearly', 79_900, 799_000)).toBe(66_583)
  })
})

describe('valeur par défaut', () => {
  /**
   * L'ANNUEL EN PREMIER, et le test porte sur l'ordre du tableau autant que sur la
   * constante : ce sont les deux faces d'une même décision — les boutons sont dessinés
   * dans l'ordre de `BILLING_PERIODS`, et la page s'ouvre sur le premier. Les laisser
   * diverger afficherait « Mensuel » en tête avec l'annuel sélectionné.
   */
  it('ouvre la page sur l’annuel', () => {
    expect(DEFAULT_BILLING_PERIOD).toBe('yearly')
    expect(BILLING_PERIODS[0]).toBe(DEFAULT_BILLING_PERIOD)
  })
})
