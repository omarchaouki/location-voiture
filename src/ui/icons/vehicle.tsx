import { Icon, type IconProps } from './icon-base'

export function CarFrontIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.2 10.2 7.9 6.4A2.2 2.2 0 0 1 9.9 5.1h4.2a2.2 2.2 0 0 1 2 1.3l1.7 3.8" />
      <path d="M4.2 10.2h15.6a1.2 1.2 0 0 1 1.2 1.2v4.4a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 15.8v-4.4a1.2 1.2 0 0 1 1.2-1.2Z" />
      <path d="M5.8 13.3h2.1M16.1 13.3h2.1" />
      <path d="M5.8 17v1.9M18.2 17v1.9" />
    </Icon>
  )
}

export function CarSideIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.6 15.6v-2.3a2 2 0 0 1 1.4-1.9l2.6-.8 2.1-2.9a2 2 0 0 1 1.6-.8h4.2a2 2 0 0 1 1.6.8l2.2 2.9 2.3.8a1.7 1.7 0 0 1 1.2 1.6v2.6h-2.3" />
      <path d="M14.7 15.6H9.3" />
      <path d="M9.7 10.9h8.6" />
      <circle cx="7" cy="15.9" r="1.9" />
      <circle cx="17" cy="15.9" r="1.9" />
    </Icon>
  )
}

export function KeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7.6" cy="7.6" r="3.6" />
      <path d="M10.2 10.2 19.6 19.6" />
      <path d="M16.2 16.2 14.3 18.1" />
      <path d="M18 18 16.4 19.6" />
    </Icon>
  )
}

export function OdometerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="M4 17h2.1M17.9 17H20" />
      <path d="M6.9 11.5l1 1M12 8.8v1.4M17.1 11.5l-1 1" />
      <path d="M12 17l4.1-5.4" />
      <circle cx="12" cy="17" r="1.1" />
    </Icon>
  )
}

export function FuelIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.2 20.4V5.6A1.6 1.6 0 0 1 5.8 4h5.6a1.6 1.6 0 0 1 1.6 1.6v14.8" />
      <path d="M3 20.4h11.6" />
      <path d="M6.6 7.1h4v3.6h-4z" />
      <path d="M13 10.4h3.3a1.8 1.8 0 0 1 1.8 1.8v3.9a1.6 1.6 0 0 0 3.2 0V9.6l-2.1-2.1" />
    </Icon>
  )
}

export function BranchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 20.5h17.2" />
      <path d="M5.2 20.5V9.6M18.8 20.5V9.6" />
      <path d="M3.8 9.6 12 4l8.2 5.6" />
      <path d="M9.6 20.5v-4.9h4.8v4.9" />
      <path d="M8.2 12.2h2.2M13.6 12.2h2.2" />
    </Icon>
  )
}
