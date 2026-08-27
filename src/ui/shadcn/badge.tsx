import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from './utils'

/**
 * Badge — la marque d'état du produit.
 *
 * La SÉVÉRITÉ est fonctionnelle, jamais décorative : `warn` et `danger` ne se posent
 * que sur une valeur qui appelle un geste. Un badge rouge affichant « 0 » depuis trois
 * mois apprend à ne plus voir le rouge (docs/DESIGN.md §2).
 *
 * **Deux vocabulaires, un seul composant.** Les noms de shadcn (`default`,
 * `secondary`, `destructive`, `outline`) cohabitent avec ceux du MÉTIER (`accent`,
 * `neutral`, `danger`, `warn`, `calm`), qui viennent du `Stamp` qu'il remplace depuis
 * le 27/08/2026.
 *
 * Ce n'est pas de la complaisance : `danger` se lit mieux que `destructive` sur une
 * facture en retard — rien n'y est détruit —, et les tables de correspondance des
 * écrans (`STATUS_TONES`, `SEVERITY_TONES`) parlent déjà cette langue. Garder les deux
 * a permis de migrer dix-neuf écrans sans réécrire une seule valeur, donc sans risquer
 * d'inverser une sévérité au passage.
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-2xs font-medium [&>svg]:size-3',
  {
    variants: {
      variant: {
        /* Vocabulaire shadcn */
        default: 'border-transparent bg-stamp-wash text-stamp',
        secondary: 'border-rule bg-surface-sunken text-muted',
        destructive: 'border-transparent bg-danger-wash text-danger',
        outline: 'border-rule text-ink',
        /* Vocabulaire métier — même dessin, nom qui dit ce que ça signifie */
        accent: 'border-transparent bg-stamp-wash text-stamp',
        neutral: 'border-rule bg-surface-sunken text-muted',
        danger: 'border-transparent bg-danger-wash text-danger',
        warn: 'border-transparent bg-warn-wash text-warn',
        calm: 'border-transparent bg-calm-wash text-calm',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

/** Le vocabulaire des états, pour les tables de correspondance des écrans. */
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>

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
