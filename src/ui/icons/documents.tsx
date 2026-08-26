import { Icon, type IconProps } from './icon-base'

export function ContractSignedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.2 3h7.4l4.2 4.2v11.9a1.9 1.9 0 0 1-1.9 1.9H6.2a1.9 1.9 0 0 1-1.9-1.9V4.9A1.9 1.9 0 0 1 6.2 3Z" />
      <path d="M13.6 3v4.2h4.2" />
      <path d="M7.6 9.8h4.8M7.6 12.4h6.8" />
      <path d="M7.4 17.2c1.1-1.6 1.9-1.6 2.5 0 .6 1.6 1.4 1.6 2.5 0 .7-.9 1.4-1 2.2-.4" />
    </Icon>
  )
}

export function InsuranceShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 5.6v5.1c0 4.2 2.8 8 7 9.3 4.2-1.3 7-5.1 7-9.3V5.6L12 3Z" />
      <path d="M9.1 11.9 11.2 14l3.7-4" />
    </Icon>
  )
}

export function InspectionBadgeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="9.8" r="5.8" />
      <path d="M9.4 10 11.4 12l3.4-3.6" />
      <path d="M8.4 14.9 7 21l5-2.3L17 21l-1.4-6.1" />
    </Icon>
  )
}

/** Vignette (TSAVA) — un timbre perforé, pas une date d'expiration. Voir docs/DECISIONS.md É3. */
export function RoadTaxStickerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.6 5.4h14.8v13.2H4.6z" />
      <path d="M8.4 5.4v13.2M15.6 5.4v13.2" strokeDasharray="1.4 2.2" />
      <path d="M10.2 10.4h3.6M10.2 13.6h3.6" />
    </Icon>
  )
}

/** Carte grise — document permanent au Maroc, donc sans marque d'échéance. É1. */
export function RegistrationCardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 5.6h17.2a1 1 0 0 1 1 1v10.8a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1Z" />
      <path d="M2.4 9.4h19.2" />
      <path d="M5.6 12.6h6.2M5.6 15.4h4" />
      <path d="M15.4 12.6h3.2v2.8h-3.2z" />
    </Icon>
  )
}

export function CustomerLicenceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.4 5.6h17.2a1 1 0 0 1 1 1v10.8a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V6.6a1 1 0 0 1 1-1Z" />
      <circle cx="8.4" cy="10.6" r="2.1" />
      <path d="M5.3 15.6c.6-1.5 1.7-2.3 3.1-2.3s2.5.8 3.1 2.3" />
      <path d="M14.6 9.6h4.6M14.6 12.4h4.6M14.6 15.2h3" />
    </Icon>
  )
}

export function PermitIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.4 3.2h11.2a1.4 1.4 0 0 1 1.4 1.4v14.8a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 19.4V4.6a1.4 1.4 0 0 1 1.4-1.4Z" />
      <path d="M8.4 7.4h7.2M8.4 10.2h7.2M8.4 13h4.2" />
      <circle cx="15.2" cy="16.2" r="2.4" />
      <path d="M13.9 18.2 13.4 21l1.8-.9 1.8.9-.5-2.8" />
    </Icon>
  )
}

export function InvoiceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5.6 3.2h12.8v17.6l-2.1-1.4-2.1 1.4-2.2-1.4-2.1 1.4-2.1-1.4-2.2 1.4Z" />
      <path d="M8.6 8h6.8M8.6 11.4h6.8M8.6 14.8h4" />
    </Icon>
  )
}

export function PricingPlanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.6 17.4h4.2v3.4H3.6zM9.9 12.4h4.2v8.4H9.9zM16.2 7.4h4.2v13.4h-4.2z" />
      <path d="M3.6 3.6h4.2" />
    </Icon>
  )
}

/** Le cachet : marque d'état terminal. Voir docs/DESIGN.md §1. */
export function StampIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="5.4" strokeDasharray="2 2.2" />
      <path d="M9.2 12h5.6" />
    </Icon>
  )
}
