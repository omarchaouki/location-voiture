import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from './utils'

/**
 * Bouton shadcn/ui — anatomie d'origine, couleurs du produit.
 *
 * Les variantes gardent les noms de shadcn (`default`, `destructive`, `outline`…)
 * pour qu'un composant copié depuis le catalogue fonctionne sans réécriture, mais
 * AUCUNE couleur littérale n'entre ici : tout passe par les jetons de rôle
 * (`--stamp`, `--rule`, `--danger`), donc le thème sombre suit tout seul et
 * `pnpm check:tokens` continue de dire la vérité.
 *
 * Deux écarts assumés par rapport au composant d'origine :
 *
 *  1. **44 px de haut, pas 36.** Sur un comptoir de location l'écran principal est un
 *     téléphone, et le jeton `--tap-target` existe pour cela. C'est le seul écart de
 *     géométrie au dessin d'origine, et il n'est pas négociable.
 *  2. **L'élévation passe par un jeton**, `shadow-control`, jamais par une valeur
 *     écrite ici. Le produit refusait toute ombre jusqu'au 26/08/2026 ; il en accepte
 *     désormais un pixel sous les contrôles, parce que c'est ce qui les fait lire
 *     comme cliquables. Les variantes SANS surface — `ghost`, `link` — la retirent :
 *     une ombre sous un fond transparent est une ombre qui flotte toute seule.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md text-sm font-medium shadow-control transition-colors',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-stamp text-stamp-contrast hover:opacity-90 active:opacity-95',
        destructive: 'border border-danger bg-transparent text-danger hover:bg-danger-wash',
        outline: 'border border-rule-strong bg-surface text-ink hover:bg-surface-sunken',
        secondary: 'bg-surface-sunken text-ink hover:bg-rule',
        ghost: 'text-ink shadow-none hover:bg-surface-sunken',
        link: 'text-stamp shadow-none underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-md px-6',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { buttonVariants }
