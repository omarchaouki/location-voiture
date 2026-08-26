import { Icon, type IconProps } from './icon-base'

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.6 21.6 20H2.4Z" />
      <path d="M12 9.6v4.6M12 17.2v.02" />
    </Icon>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.4 5.6h15.2a1 1 0 0 1 1 1v12.4a1 1 0 0 1-1 1H4.4a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1Z" />
      <path d="M3.4 9.8h17.2" />
      <path d="M8 3.2v4M16 3.2v4" />
      <path d="M7.4 13.2h3M13.6 13.2h3M7.4 16.6h3" />
    </Icon>
  )
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.6" cy="10.6" r="6.6" />
      <path d="M15.4 15.4 20.4 20.4" />
    </Icon>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 5.4h17.2L14 13v6.4l-4-2.2V13Z" />
    </Icon>
  )
}

export function ExportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15.4V3.6" />
      <path d="M8.2 7.4 12 3.6l3.8 3.8" />
      <path d="M4.4 14v5.4a1 1 0 0 0 1 1h13.2a1 1 0 0 0 1-1V14" />
    </Icon>
  )
}

export function PhotoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 5.4h16.8a1 1 0 0 1 1 1v11.2a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1V6.4a1 1 0 0 1 1-1Z" />
      <circle cx="8.4" cy="9.8" r="1.6" />
      <path d="M2.6 16.4 8.8 11l4.4 4 2.8-2.4 3.4 3" />
    </Icon>
  )
}

/** Chevron « vers le début de ligne » — miroité en RTL par défaut. */
export function ChevronStartIcon(props: IconProps) {
  return (
    <Icon directional {...props}>
      <path d="M14.6 5.4 8 12l6.6 6.6" />
    </Icon>
  )
}

/** Chevron « vers la fin de ligne » — miroité en RTL par défaut. */
export function ChevronEndIcon(props: IconProps) {
  return (
    <Icon directional {...props}>
      <path d="M9.4 5.4 16 12l-6.6 6.6" />
    </Icon>
  )
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 6.8h16.8M3.6 12h16.8M3.6 17.2h16.8" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.6 5.6 18.4 18.4M18.4 5.6 5.6 18.4" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.6 12.6 9.4 17.4 19.4 6.6" />
    </Icon>
  )
}

/** Compte de l'utilisateur : buste au trait, jamais une photo par défaut. */
export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" />
    </Icon>
  )
}

/**
 * Réglages : des curseurs, pas un engrenage.
 *
 * L'engrenage existe déjà dans le jeu (`ServiceGear`) et veut dire « entretien
 * mécanique ». Deux sens pour un même dessin, dans un produit qui parle de voitures,
 * serait une confusion garantie.
 */
export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7.4h16M4 16.6h16" />
      <circle cx="9.4" cy="7.4" r="2.2" />
      <circle cx="15" cy="16.6" r="2.2" />
    </Icon>
  )
}

/** Sortie : une porte et une flèche qui s'en va. Directionnelle en RTL. */
export function SignOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.4 4.6H6.2v14.8h8.2" />
      <path d="M11 12h9.2M17.2 8.6 20.6 12l-3.4 3.4" />
    </Icon>
  )
}

/**
 * Tableau de bord : quatre cases, pas une jauge.
 *
 * La jauge appartient au véhicule (`Odometer`), l'engrenage à l'entretien
 * (`ServiceGear`). Un tableau de bord logiciel est une grille de cartes — c'est ce
 * que l'utilisateur voit derrière le lien, et c'est ce que le dessin montre.
 */
export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.6" y="3.6" width="7" height="7" rx="1.4" />
      <rect x="13.4" y="3.6" width="7" height="7" rx="1.4" />
      <rect x="3.6" y="13.4" width="7" height="7" rx="1.4" />
      <rect x="13.4" y="13.4" width="7" height="7" rx="1.4" />
    </Icon>
  )
}

/** Une agence cliente : une façade et sa porte. Jamais un « immeuble de bureaux ». */
export function BuildingIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.4 20.4V5.6a1.4 1.4 0 0 1 1.4-1.4h8.4a1.4 1.4 0 0 1 1.4 1.4v14.8" />
      <path d="M15.6 10.2h2.6a1.4 1.4 0 0 1 1.4 1.4v8.8" />
      <path d="M3 20.4h18" />
      <path d="M8 8.4h4M8 12.2h4" />
      <path d="M9.4 20.4v-3.6h1.2v3.6" />
    </Icon>
  )
}

/** Une courbe qui monte. Sert au chiffre d'affaires et aux volumes, jamais à une alerte. */
export function TrendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 19.4h16.8" />
      <path d="M6.2 15.4l4-4.4 3.2 2.6 4.8-5.6" />
      <path d="M14.4 8h3.8v3.8" />
    </Icon>
  )
}

/**
 * Langue : un globe et ses parallèles.
 *
 * Pas un drapeau. Un drapeau désigne un PAYS, pas une langue — l'arabe n'est pas
 * marocain, l'anglais n'est pas britannique, et choisir un drapeau pour une langue
 * revient à trancher une question politique dans une barre de navigation.
 */
export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.6 12h16.8" />
      <path d="M12 3.6c2.1 2.3 3.2 5.2 3.2 8.4s-1.1 6.1-3.2 8.4c-2.1-2.3-3.2-5.2-3.2-8.4S9.9 5.9 12 3.6Z" />
    </Icon>
  )
}
