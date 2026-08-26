import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from './utils'

/**
 * Badge.
 *
 * La SÉVÉRITÉ est fonctionnelle, jamais décorative : `warn` et `danger` ne se posent
 * que sur une valeur qui appelle un geste. Un badge rouge affichant « 0 » depuis trois
 * mois apprend à ne plus voir le rouge (docs/DESIGN.md §2).
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-2xs font-medium [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-stamp-wash text-stamp',
        secondary: 'border-rule bg-surface-sunken text-muted',
        destructive: 'border-transparent bg-danger-wash text-danger',
        warn: 'border-transparent bg-warn-wash text-warn',
        calm: 'border-transparent bg-calm-wash text-calm',
        outline: 'border-rule text-ink',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { badgeVariants }
