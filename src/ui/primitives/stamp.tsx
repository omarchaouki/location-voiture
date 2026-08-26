import type { ReactNode } from 'react'

export type StampTone = 'neutral' | 'calm' | 'warn' | 'danger' | 'accent'

const TONE_CLASSES: Record<StampTone, string> = {
  neutral: 'text-muted border-rule-strong',
  calm: 'text-calm border-calm',
  warn: 'text-warn border-warn',
  danger: 'text-danger border-danger',
  accent: 'text-stamp border-stamp',
}

/**
 * Le cachet : marque d'état terminal (payé, expiré, clôturé, en infraction).
 *
 * Contour, capitales espacées, légère rotation. Jamais de fond plein arrondi —
 * une pastille colorée est exactement ce que cette direction refuse.
 * docs/DESIGN.md §1.
 *
 * La couleur ne porte jamais l'information seule : le libellé la porte aussi.
 */
export function Stamp({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: StampTone
  className?: string
}) {
  return (
    <span
      className={`inline-block -rotate-[1.5deg] border px-2 py-[2px] text-2xs font-medium tracking-[0.14em] uppercase ${TONE_CLASSES[tone]} ${className ?? ''}`}
    >
      {children}
    </span>
  )
}
