import {
  AlertIcon,
  BuildingIcon,
  CarSideIcon,
  ContractSignedIcon,
  FineIcon,
  GpsIcon,
  GridIcon,
  InvoiceIcon,
  TrendIcon,
  UserIcon,
  type IconProps,
} from '~/ui/icons'

/**
 * Les rubriques de navigation, listées une seule fois.
 *
 * Elles servent à trois endroits — la barre latérale sur écran large, la bande
 * défilante sur téléphone, et la vitrine `/design` — et une rubrique ajoutée doit
 * apparaître aux trois sans qu'on y pense.
 *
 * Chaque rubrique porte une icône : une navigation en texte seul se lit mal en
 * balayage, et une navigation en icônes seules ne se lit pas du tout (`nav-label-icon`).
 * Les deux, toujours.
 */
export interface Destination {
  readonly to: string
  readonly key: string
  readonly exact?: boolean
  readonly icon: (props: IconProps) => React.ReactElement
}

export const APP_DESTINATIONS: readonly Destination[] = [
  { to: '/$lang/app', key: 'nav.dashboard', exact: true, icon: GridIcon },
  { to: '/$lang/app/vehicules', key: 'nav.vehicles', icon: CarSideIcon },
  { to: '/$lang/app/clients', key: 'nav.customers', icon: UserIcon },
  { to: '/$lang/app/contrats', key: 'nav.contracts', icon: ContractSignedIcon },
  { to: '/$lang/app/amendes', key: 'nav.fines', icon: FineIcon },
  { to: '/$lang/app/suivi', key: 'nav.map', icon: GpsIcon },
  { to: '/$lang/app/alertes', key: 'alerts.title', icon: AlertIcon },
  { to: '/$lang/app/abonnement', key: 'nav.billing', icon: InvoiceIcon },
]

export const ADMIN_DESTINATIONS: readonly Destination[] = [
  { to: '/$lang/admin', key: 'admin.overview', exact: true, icon: TrendIcon },
  { to: '/$lang/admin/organisations', key: 'admin.organizations', icon: BuildingIcon },
  { to: '/$lang/admin/prospects', key: 'admin.leads', icon: UserIcon },
]
