import { Icon, type IconProps } from './icon-base'

export function OilCanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 12.4h9.2v5.2a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6Z" />
      <path d="M12.8 14.2 17 11.6l3.8 1.1" />
      <path d="M6.4 12.4V9.8h4.2v2.6" />
      <path d="M8.5 9.8V7.2" />
      <path d="M6.6 7.2h3.8" />
    </Icon>
  )
}

/** Jauge de vidange : l'échéance en kilomètres ET en temps, un seul cadran. */
export function OilGaugeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.8 17.4a8.2 8.2 0 0 1 16.4 0" />
      <path d="M3.8 17.4h2M18.2 17.4h2" />
      <path d="M12 17.4 15.8 12.2" />
      <circle cx="12" cy="17.4" r="1.1" />
      <path d="M8.6 8.4c0-1.1 1.4-2.8 1.4-2.8s1.4 1.7 1.4 2.8a1.4 1.4 0 0 1-2.8 0Z" />
    </Icon>
  )
}

export function ServiceGearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.2v2.4M12 18.4v2.4M20.8 12h-2.4M5.6 12H3.2" />
      <path d="M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7M18.2 18.2l-1.7-1.7M7.5 7.5 5.8 5.8" />
    </Icon>
  )
}

export function BreakdownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.8 16v-2.1a1.8 1.8 0 0 1 1.3-1.7l2.4-.8 2-2.7a1.8 1.8 0 0 1 1.4-.7h3.2" />
      <path d="M2.8 16h2M9.1 16h3.4" />
      <circle cx="6.9" cy="16.2" r="1.8" />
      <circle cx="14.3" cy="16.2" r="1.8" />
      <path d="M18.4 3.6 22.2 10h-7.6Z" />
      <path d="M18.4 6.3v1.6M18.4 9v.02" />
    </Icon>
  )
}
