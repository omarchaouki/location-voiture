import * as LabelPrimitive from '@radix-ui/react-label'
import { ChevronDown } from 'lucide-react'
import type * as React from 'react'

import { cn } from './utils'

/**
 * CHAMPS DE SAISIE — la SEULE définition d'un contrôle dans ce produit.
 *
 * Il y en avait quatre au 27/08/2026 : celle-ci, une copie dans `src/ui/forms/fields.tsx`,
 * une troisième recopiée à la main dans le formulaire véhicule, une quatrième dans le
 * combobox. Elles avaient déjà divergé — arrondi ici, angles vifs là, une bordure de
 * filet au lieu d'une bordure de contrôle. Tout passe désormais par `CONTROL`, et les
 * autres modules l'importent au lieu de le recopier.
 *
 * Quatre règles portées par le composant plutôt que rappelées à chaque écran, parce
 * qu'une règle qu'il faut se rappeler finit par être oubliée :
 *
 *  1. **Une hauteur qui vient du jeton `--control-h`** : 40 px à la souris, 44 px au
 *     doigt. Un formulaire de quatorze champs ne se lit pas s'il fait deux écrans.
 *  2. **`text-sm` au clavier, 16 px au doigt.** Sous 640 px, Safari iOS zoome dès qu'un
 *     champ descend sous 16 px : l'écran grossit à la mise au point et l'utilisateur
 *     perd le cadrage. La règle non superposée d'`app.css` remonte la taille, et elle
 *     l'emporte volontairement sur ce `text-sm`.
 *  3. **Le focus se voit deux fois** : la bordure prend le bleu, et l'anneau d'`app.css`
 *     pose son halo. Une seule des deux marques suffirait ; deux se remarquent sans
 *     qu'on les cherche, ce qui est exactement ce qu'on veut d'un champ.
 *  4. **`aria-invalid` colore la bordure**, mais l'erreur elle-même reste un texte sous
 *     le champ — la couleur seule ne dit rien à qui ne la distingue pas
 *     (`color-not-only`).
 */
const CONTROL = [
  'w-full min-w-0 rounded-md border border-input bg-card px-3',
  'text-sm text-foreground shadow-control',
  'transition-[border-color,background-color,box-shadow] duration-150',
  'placeholder:text-muted-foreground',
  'hover:border-ring/60',
  'focus:border-ring',
  // Désactivé : le champ perd sa bordure de contrôle ET son relief. Un champ grisé qui
  // garde son ombre continue de se proposer à la saisie.
  'disabled:cursor-not-allowed disabled:border-border disabled:bg-muted',
  'disabled:text-muted-foreground disabled:shadow-none',
  'read-only:border-border read-only:bg-muted read-only:text-muted-foreground read-only:shadow-none',
  'aria-invalid:border-destructive',
].join(' ')

/**
 * La classe du contrôle, exposée pour les champs qui ne peuvent pas être un `<input>`
 * de cette couche — le combobox, qui pilote son propre élément. Elle est exportée
 * plutôt que recopiée : c'est tout l'intérêt de l'avoir écrite une fois.
 */
export function controlClass(...extra: Parameters<typeof cn>) {
  return cn(CONTROL, ...extra)
}

/** Hauteur des contrôles d'UNE ligne. Les zones de texte s'en dispensent. */
export const CONTROL_HEIGHT = { height: 'var(--control-h)' } as const

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      /*
       * L'étiquette est de l'ENCRE, pas du gris sourd. Elle était en
       * `text-muted-foreground` : sur un formulaire de quatorze champs, quatorze
       * libellés pâles font une grille illisible où seule la saisie ressort. Le poids
       * moyen et la petite taille suffisent à la mettre au second plan.
       */
      className={cn('block text-xs font-medium text-foreground select-none', className)}
      {...props}
    />
  )
}

export function Input({ className, style, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      className={cn(CONTROL, className)}
      style={{ ...CONTROL_HEIGHT, ...style }}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(CONTROL, 'min-h-20 py-2', className)} {...props} />
}

/**
 * Menu déroulant NATIF, et c'est délibéré.
 *
 * Le `Select` de Radix est plus beau et coûte 30 ko ; le natif ouvre la roulette du
 * système, fonctionne sans JavaScript, se pilote au clavier sans qu'on ait rien à
 * écrire, et se traduit tout seul. Pour un choix parmi cinq options c'est le meilleur
 * outil (`system-controls`). Le Radix est réservé aux listes qui demandent une
 * recherche, et celles-là passent déjà par `src/ui/forms/combobox.tsx`.
 *
 * Seule la FLÈCHE est reprise en main : celle du système est grise, épaisse, et
 * différente sur chaque plateforme — c'est le seul endroit où un `<select>` natif
 * trahit qu'il n'appartient pas au reste du formulaire. Elle est posée du côté FIN de
 * la ligne, donc à gauche en arabe, sans une seule propriété physique.
 */
export function Select({ className, style, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        data-slot="select"
        className={cn(CONTROL, 'appearance-none pe-9', className)}
        style={{ ...CONTROL_HEIGHT, ...style }}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

/**
 * Case à cocher.
 *
 * Native, redressée par `accent-color` (posé dans `app.css` sur le produit entier) :
 * elle prend le bleu du thème sans qu'on ait à redessiner une case en `<div>`, et elle
 * garde le comportement clavier et le mode contrasté du système.
 */
export function Checkbox({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn('size-4 shrink-0 cursor-pointer', className)}
      {...props}
    />
  )
}

/**
 * Case à cocher AVEC son libellé, sur une ligne.
 *
 * Elle existe parce que la version écrite à la main dans chaque écran oubliait à chaque
 * fois la même chose : la hauteur de cible. Une case fait 16 px ; c'est le `<label>`
 * autour qui doit en faire 44.
 */
export function CheckboxField({
  label,
  className,
  ...props
}: React.ComponentProps<'input'> & { label: string }) {
  return (
    <label
      className={cn('flex cursor-pointer items-center gap-2.5 text-sm', className)}
      style={{ minHeight: 'var(--tap-target)' }}
    >
      <Checkbox {...props} />
      <span>{label}</span>
    </label>
  )
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
  required,
  className,
  children,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  /** Marque l'étiquette d'une astérisque. La contrainte réelle reste sur le contrôle. */
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div data-slot="field" className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            {' *'}
          </span>
        ) : null}
      </Label>
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
