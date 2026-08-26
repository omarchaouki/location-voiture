import { Icon, type IconProps } from './icon-base'

export function GpsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21.2s6.4-6.2 6.4-10.4a6.4 6.4 0 1 0-12.8 0C5.6 15 12 21.2 12 21.2Z" />
      <circle cx="12" cy="10.7" r="2.4" />
    </Icon>
  )
}

export function GeofenceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8.6 10.6 4l9 4.6-2.6 9-9.6 2Z" strokeDasharray="2.4 2.4" />
      <circle cx="11.6" cy="11.4" r="2.2" />
    </Icon>
  )
}

export function FineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.2 3.4h8.2l4.2 4.2v13H6.2Z" />
      <path d="M14.4 3.4v4.2h4.2" />
      <path d="M12.3 10.4v4.4M12.3 17.4v.02" />
    </Icon>
  )
}

export function DepositIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 9.6h17.2v8.8H3.4z" />
      <circle cx="12" cy="14" r="2.2" />
      <path d="M9.4 9.6V7.3a2.6 2.6 0 0 1 5.2 0v2.3" />
    </Icon>
  )
}
