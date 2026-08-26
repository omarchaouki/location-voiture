import { describe, expect, it } from 'vitest'

import { layoutRail } from '~/core/rail-layout'

/**
 * La frise est la signature du produit (docs/DESIGN.md §5). Ces tests protègent
 * les trois propriétés dont dépend sa lisibilité — et donc sa raison d'exister.
 */
describe('layoutRail', () => {
  it('place la ligne « aujourd’hui » entre le passé et le futur', () => {
    const layout = layoutRail([
      { id: 'past', days: -30 },
      { id: 'future', days: 30 },
    ])
    const past = layout.placements.find((p) => p.id === 'past')!
    const future = layout.placements.find((p) => p.id === 'future')!

    expect(past.y).toBeLessThan(layout.todayY)
    expect(future.y).toBeGreaterThan(layout.todayY)
  })

  it('compresse le temps : 200 jours ne sont pas 200 fois plus loin que 1 jour', () => {
    const layout = layoutRail([
      { id: 'near', days: 1 },
      { id: 'far', days: 200 },
    ])
    const near = layout.placements.find((p) => p.id === 'near')!
    const far = layout.placements.find((p) => p.id === 'far')!

    const nearDistance = near.y - layout.todayY
    const farDistance = far.y - layout.todayY

    expect(farDistance).toBeGreaterThan(nearDistance)
    // Sans compression le rapport serait de 200 ; avec log il reste lisible.
    expect(farDistance / nearDistance).toBeLessThan(12)
  })

  it('ne superpose jamais deux entrées, même le même jour', () => {
    const layout = layoutRail([
      { id: 'a', days: 3 },
      { id: 'b', days: 3 },
      { id: 'c', days: 3 },
      { id: 'd', days: -3 },
      { id: 'e', days: -3 },
    ])
    const ys = layout.placements.map((p) => p.y).sort((a, b) => a - b)
    for (let index = 1; index < ys.length; index += 1) {
      expect(ys[index]! - ys[index - 1]!).toBeGreaterThanOrEqual(43)
    }
  })

  it('garde toutes les entrées dans la hauteur annoncée', () => {
    const layout = layoutRail([
      { id: 'a', days: -400 },
      { id: 'b', days: -1 },
      { id: 'c', days: 0 },
      { id: 'd', days: 2 },
      { id: 'e', days: 365 },
    ])
    for (const placement of layout.placements) {
      expect(placement.y).toBeGreaterThanOrEqual(0)
      expect(placement.y).toBeLessThanOrEqual(layout.height)
    }
    expect(layout.todayY).toBeGreaterThan(0)
  })

  it('supporte une frise vide sans exploser', () => {
    const layout = layoutRail([])
    expect(layout.placements).toHaveLength(0)
    expect(layout.height).toBeGreaterThan(0)
  })

  it('est déterministe : deux appels identiques donnent le même résultat', () => {
    const input = [
      { id: 'a', days: -12 },
      { id: 'b', days: 7 },
    ]
    expect(layoutRail(input)).toEqual(layoutRail(input))
  })
})
