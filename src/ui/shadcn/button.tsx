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
 *  1. **La hauteur vient du jeton `--control-h`, pas de l'échelle de shadcn.** 40 px à
 *     la souris, 44 px au doigt (`--tap-target`), et surtout : EXACTEMENT la hauteur
 *     des champs. Un bouton d'envoi qui dépasse de quatre pixels le champ d'à côté se
 *     voit sur toutes les barres d'action du produit, et c'était le cas jusqu'au
 *     27/08/2026 — les champs étaient à 44, les boutons aussi, mais rien ne le
 *     garantissait : les deux valeurs étaient écrites séparément.
 *  2. **L'élévation passe par un jeton**, `shadow-control`, jamais par une valeur
 *     écrite ici. Le produit refusait toute ombre jusqu'au 26/08/2026 ; il en accepte
 *     désormais un pixel sous les contrôles, parce que c'est ce qui les fait lire
 *     comme cliquables. Les variantes SANS surface — `ghost`, `link` — la retirent :
 *     une ombre sous un fond transparent est une ombre qui flotte toute seule.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap',
    'rounded-md text-sm font-medium shadow-control transition-colors duration-150',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        /*
         * `bg-primary/90` plutôt qu'`opacity-90` au survol : baisser l'opacité d'un
         * bouton bleu sur fond blanc le DÉLAVE — le texte blanc s'éclaircit avec le
         * fond. La teinte du fond seule s'assombrit dans le bon sens, dans les deux
         * thèmes.
         */
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95',
        destructive: 'border border-destructive bg-transparent text-destructive hover:bg-destructive/10',
        outline: 'border border-input bg-card text-foreground hover:border-ring/60 hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'text-foreground shadow-none hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary shadow-none underline-offset-4 hover:underline',
      },
      /*
       * Les hauteurs sont des JETONS, pas des marches de l'échelle Tailwind : le
       * bouton et le champ qu'il accompagne doivent faire la même chose au pixel, et
       * la seule façon de le garantir est qu'ils lisent la même variable.
       */
      size: {
        default: 'h-(--control-h) px-4',
        sm: 'h-9 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-md px-6',
        icon: 'size-(--control-h)',
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
