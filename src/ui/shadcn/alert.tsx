import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from './utils'

/**
 * ALERTE — le retour d'un formulaire ou d'un écran.
 *
 * Deux points qui ne se négocient pas :
 *
 *  1. **`role` est fourni par l'appelant**, pas figé ici. Une erreur prend
 *     `role="alert"` (annoncée immédiatement) ; une confirmation prend `role="status"`
 *     (annoncée sans interrompre). Poser `alert` partout ferait hurler un lecteur
 *     d'écran sur un « Envoyé, merci ».
 *  2. **Un filet porté sur le bord d'attaque**, en propriété logique (`border-s`), et
 *     une couleur de rôle. Pas d'icône obligatoire, mais la variante donne toujours
 *     un mot ET une couleur — jamais la couleur seule (`color-not-only`).
 */
const alertVariants = cva('rounded-sm border-s-2 px-3 py-2 text-sm', {
  variants: {
    variant: {
      default: 'border-rule-strong bg-surface-sunken text-ink',
      success: 'border-calm bg-calm-wash text-calm',
      warn: 'border-warn bg-warn-wash text-warn',
      destructive: 'border-danger bg-danger-wash text-danger',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

export function AlertTitle({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="alert-title" className={cn('font-medium', className)} {...props} />
}

export function AlertDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="alert-description" className={cn('opacity-90', className)} {...props} />
}

export { alertVariants }
