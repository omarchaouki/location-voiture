// i18n-exempt — cette primitive ne produit aucun texte : légende, options et détails
// lui sont passés déjà traduits par l'appelant.

import { cn } from '~/ui/shadcn/utils'

/**
 * CHOIX UNIQUE, en cartes cliquables.
 *
 * Un `<select>` demande trois gestes — ouvrir, faire défiler, choisir — et cache les
 * options tant qu'on n'a pas ouvert. Quand il n'y a que trois ou quatre réponses et
 * qu'elles doivent être COMPARÉES avant de choisir (« 6 à 15 voitures » contre « 16 à
 * 40 »), les montrer toutes coûte moins cher que de les cacher.
 *
 * **Ce sont de vrais boutons radio**, simplement rendus invisibles. Rien n'est
 * réimplémenté : le groupement par `name`, les flèches du clavier, le `required` qui
 * refuse un groupe vide, la restitution dans `FormData` — tout vient du navigateur.
 * La carte n'est que l'habillage du `<label>` qui les enveloppe, et l'état coché se
 * lit en CSS (`has-[:checked]:`), donc sans une ligne d'état React.
 *
 * L'anneau de focus est reporté du radio caché vers la carte
 * (`has-[:focus-visible]:`) : un focus invisible est un focus perdu.
 */

export interface Choice {
  value: string
  label: string
  /** Seconde ligne, facultative : ce qui distingue deux réponses voisines. */
  detail?: string
}

export function ChoiceGroup({
  name,
  legend,
  hint,
  options,
  defaultValue,
  required,
  columns = 2,
  className,
}: {
  name: string
  legend: string
  hint?: string
  options: readonly Choice[]
  defaultValue?: string
  required?: boolean
  columns?: 2 | 3 | 4
  className?: string
}) {
  return (
    <fieldset className={cn('grid gap-2.5', className)}>
      <legend className="mb-1.5 block text-xs font-medium text-foreground">
        {legend}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            {' *'}
          </span>
        ) : null}
      </legend>

      <div
        className={cn(
          'grid gap-2.5',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'sm:grid-cols-3',
          columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            style={{ minHeight: 'var(--tap-target)' }}
            className={cn(
              'flex cursor-pointer flex-col justify-center gap-0.5 rounded-lg border border-input bg-card px-3 py-2',
              'text-sm shadow-control transition-colors',
              'hover:border-ring/60 hover:bg-accent',
              'has-[:checked]:border-ring has-[:checked]:bg-accent has-[:checked]:text-accent-foreground',
              'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring/55',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={defaultValue === option.value}
              required={required}
              className="sr-only"
            />
            <span className="font-medium">{option.label}</span>
            {option.detail ? (
              <span className="text-2xs text-muted-foreground">{option.detail}</span>
            ) : null}
          </label>
        ))}
      </div>

      {hint ? <p className="text-2xs text-muted-foreground">{hint}</p> : null}
    </fieldset>
  )
}
