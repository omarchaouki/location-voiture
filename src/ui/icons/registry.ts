import type { IconProps } from './icon-base'
import * as icons from './index'

export interface IconRegistryEntry {
  name: string
  Component: (props: IconProps) => React.JSX.Element
}

/**
 * Inventaire ORDONNÉ du jeu d'icônes, pour la planche de vérification.
 *
 * L'ordre est écrit à la main et non déduit de `Object.entries(icons)` : l'ordre des
 * clés d'un objet d'espace de noms de module n'est pas garanti identique entre le
 * paquet serveur et le paquet client, ce qui produit une erreur d'hydratation
 * silencieuse — constatée pour de vrai sur cette page en Phase 1.
 *
 * `tests/unit/icon-registry.test.ts` échoue si une icône exportée manque ici.
 */
export const ICON_REGISTRY: ReadonlyArray<IconRegistryEntry> = [
  // Véhicule
  { name: 'CarFront', Component: icons.CarFrontIcon },
  { name: 'CarSide', Component: icons.CarSideIcon },
  { name: 'Key', Component: icons.KeyIcon },
  { name: 'Odometer', Component: icons.OdometerIcon },
  { name: 'Fuel', Component: icons.FuelIcon },
  { name: 'Branch', Component: icons.BranchIcon },

  // Documents
  { name: 'ContractSigned', Component: icons.ContractSignedIcon },
  { name: 'InsuranceShield', Component: icons.InsuranceShieldIcon },
  { name: 'InspectionBadge', Component: icons.InspectionBadgeIcon },
  { name: 'RoadTaxSticker', Component: icons.RoadTaxStickerIcon },
  { name: 'RegistrationCard', Component: icons.RegistrationCardIcon },
  { name: 'CustomerLicence', Component: icons.CustomerLicenceIcon },
  { name: 'Permit', Component: icons.PermitIcon },
  { name: 'Invoice', Component: icons.InvoiceIcon },
  { name: 'PricingPlan', Component: icons.PricingPlanIcon },
  { name: 'Stamp', Component: icons.StampIcon },

  // Entretien
  { name: 'OilCan', Component: icons.OilCanIcon },
  { name: 'OilGauge', Component: icons.OilGaugeIcon },
  { name: 'ServiceGear', Component: icons.ServiceGearIcon },
  { name: 'Breakdown', Component: icons.BreakdownIcon },

  // Suivi et argent
  { name: 'Gps', Component: icons.GpsIcon },
  { name: 'Geofence', Component: icons.GeofenceIcon },
  { name: 'Fine', Component: icons.FineIcon },
  { name: 'Deposit', Component: icons.DepositIcon },

  // Interface
  { name: 'Alert', Component: icons.AlertIcon },
  { name: 'Calendar', Component: icons.CalendarIcon },
  { name: 'Search', Component: icons.SearchIcon },
  { name: 'Filter', Component: icons.FilterIcon },
  { name: 'Export', Component: icons.ExportIcon },
  { name: 'Photo', Component: icons.PhotoIcon },
  { name: 'ChevronStart', Component: icons.ChevronStartIcon },
  { name: 'ChevronEnd', Component: icons.ChevronEndIcon },
  { name: 'Menu', Component: icons.MenuIcon },
  { name: 'Close', Component: icons.CloseIcon },
  { name: 'Check', Component: icons.CheckIcon },
  { name: 'User', Component: icons.UserIcon },
  { name: 'Settings', Component: icons.SettingsIcon },
  { name: 'SignOut', Component: icons.SignOutIcon },
  { name: 'Grid', Component: icons.GridIcon },
  { name: 'Building', Component: icons.BuildingIcon },
  { name: 'Trend', Component: icons.TrendIcon },
  { name: 'Globe', Component: icons.GlobeIcon },
]
