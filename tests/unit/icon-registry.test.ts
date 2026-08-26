import { describe, expect, it } from 'vitest'

import * as icons from '~/ui/icons'
import { ICON_REGISTRY } from '~/ui/icons/registry'

/**
 * L'inventaire de la planche de vérification est écrit à la main, parce que déduire
 * l'ordre de `Object.entries(icons)` produit une erreur d'hydratation : l'ordre des
 * clés d'un espace de noms de module n'est pas garanti identique entre le paquet
 * serveur et le paquet client. Ce test remplace la déduction par une garantie.
 */
describe('inventaire des icônes', () => {
  const exported = Object.keys(icons)
    .filter((key) => key.endsWith('Icon') && key !== 'Icon')
    .map((key) => key.replace(/Icon$/, ''))

  it('la planche liste toutes les icônes exportées', () => {
    const listed = new Set(ICON_REGISTRY.map((entry) => entry.name))
    expect(exported.filter((name) => !listed.has(name))).toEqual([])
  })

  it('la planche ne liste rien qui n’existe pas', () => {
    const known = new Set(exported)
    expect(ICON_REGISTRY.map((entry) => entry.name).filter((name) => !known.has(name))).toEqual([])
  })

  it('aucun doublon', () => {
    const names = ICON_REGISTRY.map((entry) => entry.name)
    expect(names).toHaveLength(new Set(names).size)
  })

  it('couvre le minimum exigé par le cahier des charges', () => {
    const required = [
      'CarFront',
      'CarSide',
      'Key',
      'ContractSigned',
      'InsuranceShield',
      'OilCan',
      'OilGauge',
      'ServiceGear',
      'InspectionBadge',
      'RoadTaxSticker',
      'Gps',
      'Geofence',
      'Fuel',
      'Odometer',
      'Fine',
      'Deposit',
      'CustomerLicence',
      'Breakdown',
      'Branch',
      'Invoice',
      'PricingPlan',
    ]
    const listed = new Set(ICON_REGISTRY.map((entry) => entry.name))
    expect(required.filter((name) => !listed.has(name))).toEqual([])
  })
})
