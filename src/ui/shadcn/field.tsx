import * as LabelPrimitive from '@radix-ui/react-label'
import type * as React from 'react'

import { cn } from './utils'

/**
 * CHAMPS DE SAISIE.
 *
 * Trois règles portées par le composant plutôt que rappelées à chaque écran, parce
 * qu'une règle qu'il faut se rappeler finit par être oubliée :
 *
 *  1. **`text-base`, jamais `text-sm`.** Sous 640 px, Safari iOS zoome dès qu'un champ
 *     descend sous 16 px : l'écran grossit à la mise au point et l'utilisateur perd le
 *     cadrage. La règle non superposée de `app.css` remonte la taille ; le composant ne
 *     doit pas la contredire.
 *  2. **44 px de haut** (`--tap-target`) : un champ se remplit au pouce.
 *  3. **`aria-invalid` colore la bordure**, mais l'erreur elle-même reste un texte sous
 *     le champ — la couleur seule ne dit rien à qui ne la distingue pas
 *     (`color-not-only`).
 */
const CONTROL = [
  'block w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 shadow-control',
  'text-base text-foreground transition-colors',
  'placeholder:text-muted-foreground focus:border-primary',
  'disabled:cursor-not-allowed disabled:opacity-45',
  'aria-invalid:border-destructive',
].join(' ')

/** Hauteur minimale des contrôles d'une ligne. Les zones de texte s'en dispensent. */
const CONTROL_HEIGHT = { minHeight: 'var(--tap-target)' } as const

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn('block text-xs text-muted-foreground select-none', className)}
      {...props}
    />
  )
}

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(CONTROL, className)} style={CONTROL_HEIGHT} {...props} />
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(CONTROL, 'min-h-20', className)} {...props} />
}

/**
 * Menu déroulant NATIF, et c'est délibéré.
 *
 * Le `Select` de Radix est plus beau et coûte 30 ko ; le natif ouvre la roulette du
 * système, fonctionne sans JavaScript, se pilote au clavier sans qu'on ait rien à
 * écrire, et se traduit tout seul. Pour un choix parmi cinq options c'est le meilleur
 * outil (`system-controls`). Le Radix est réservé aux listes qui demandent une
 * recherche, et celles-là passent déjà par `src/ui/forms/combobox.tsx`.
 */
export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return <select data-slot="select" className={cn(CONTROL, className)} style={CONTROL_HEIGHT} {...props} />
}

/**
 * Le bloc complet : étiquette, contrôle, aide, erreur.
 *
 * L'étiquette est TOUJOURS visible — jamais un `placeholder` en guise de libellé.
 * Un placeholder disparaît à la première frappe, et l'utilisateur qui revient sur un
 * formulaire à moitié rempli ne sait plus ce qu'il remplissait (`input-labels`).
 */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div data-slot="field" className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-2xs text-muted-foreground">{hint}</p> : null}
      {/* L'erreur se place SOUS le champ concerné, pas en tête de formulaire : c'est
          là que le regard revient après une soumission refusée (`error-placement`). */}
      {error ? (
        <p role="alert" className="text-2xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
