import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Field as FieldBlock,
  Input,
  Select as SelectControl,
  Textarea,
} from '~/ui/shadcn/field'

import { Combobox } from './combobox'

/**
 * Champs de formulaire — la couche que les ÉCRANS utilisent.
 *
 * Elle ne dessine plus rien : tout le dessin est dans `src/ui/shadcn/field.tsx`, et ce
 * fichier ne fait que l'habiller de ce dont un formulaire de ce produit a besoin —
 * un `name`, une étiquette, une aide, des chiffres tabulaires par défaut, et des
 * options d'énumération traduites.
 *
 * Jusqu'au 27/08/2026 elle portait sa PROPRE copie de la classe de contrôle
 * (`INPUT_CLASS`), et les deux avaient divergé : arrondi `sm` ici, `md` là, une ombre
 * d'un côté seulement. C'est le genre d'écart qu'on ne voit pas écran par écran, et
 * qui saute aux yeux quand on les met côte à côte.
 *
 * L'étiquette et le contrôle sont désormais reliés par `id`/`htmlFor` plutôt que par
 * l'imbrication : c'est ce que demande le `<label>` de Radix, et cela permet de poser
 * l'aide et l'erreur SOUS le champ sans les faire entrer dans la zone cliquable.
 */

type NativeInputProps = Omit<React.ComponentProps<'input'>, 'className' | 'id'>

export function Field({
  label,
  hint,
  error,
  numeric = true,
  className,
  ...input
}: NativeInputProps & {
  label: string
  hint?: string
  /** Message sous le champ. Colore aussi la bordure via `aria-invalid`. */
  error?: string
  /** Chiffres tabulaires par défaut : plaques, montants, dates s'alignent. */
  numeric?: boolean
  /** Classe du BLOC (`sm:col-span-2`…), jamais du contrôle. */
  className?: string
}) {
  const id = useId()

  return (
    <FieldBlock
      label={label}
      htmlFor={id}
      {...(hint === undefined ? {} : { hint })}
      {...(error === undefined ? {} : { error })}
      {...(input.required === undefined ? {} : { required: input.required })}
      {...(className === undefined ? {} : { className })}
    >
      <Input
        id={id}
        className={numeric ? 'numeric' : undefined}
        {...(error ? { 'aria-invalid': true } : {})}
        {...input}
      />
    </FieldBlock>
  )
}

export function TextArea({
  name,
  label,
  hint,
  rows = 3,
  className = 'sm:col-span-2',
  ...textarea
}: Omit<React.ComponentProps<'textarea'>, 'className' | 'id'> & {
  label: string
  hint?: string
  className?: string
}) {
  const id = useId()

  return (
    <FieldBlock label={label} htmlFor={id} className={className} {...(hint === undefined ? {} : { hint })}>
      <Textarea id={id} name={name} rows={rows} {...textarea} />
    </FieldBlock>
  )
}

export function Select({
  name,
  label,
  options,
  prefix,
  hint,
  className,
  ...select
}: Omit<React.ComponentProps<'select'>, 'className' | 'id' | 'children'> & {
  label: string
  options: readonly string[]
  /** Préfixe de clé i18n : les valeurs d'énumération se traduisent aussi. */
  prefix: string
  hint?: string
  className?: string
}) {
  const { t } = useTranslation()
  const id = useId()

  return (
    <FieldBlock
      label={label}
      htmlFor={id}
      {...(hint === undefined ? {} : { hint })}
      {...(className === undefined ? {} : { className })}
    >
      <SelectControl id={id} name={name} {...select}>
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`${prefix}.${option}`)}
          </option>
        ))}
      </SelectControl>
    </FieldBlock>
  )
}

/**
 * Liste de choix issue des données (véhicules, clients).
 *
 * **C'était un `<select>` natif, ce n'en est plus un.** La signature n'a pas bougé —
 * même nom, mêmes options `{value, label}` — mais tous les appelants héritent d'un
 * champ qui se filtre en tapant. C'est ce qui rendait la création de contrat pénible :
 * choisir une voiture dans une flotte de quarante, ou un client parmi trois cents,
 * se faisait à la roulette.
 *
 * Le mode est `strict` : un identifiant de véhicule n'est pas du texte libre.
 */
export function Picker({
  name,
  label,
  options,
  required,
  defaultValue,
  onValueChange,
  layout = 'field',
}: {
  name: string
  label: string
  options: ReadonlyArray<{ value: string; label: string; detail?: string }>
  required?: boolean
  defaultValue?: string
  onValueChange?: (value: string) => void
  layout?: 'field' | 'inline'
}) {
  const { t } = useTranslation()

  return (
    <Combobox
      name={name}
      label={label}
      mode="strict"
      layout={layout}
      options={options}
      {...(required === undefined ? {} : { required })}
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      hint={t('form.searchHint')}
      emptyLabel={t('form.noMatch')}
      countLabel={(count) => t('form.matchCount', { count })}
    />
  )
}

/**
 * Le refus du formulaire, en tête de la zone d'action.
 *
 * C'était un filet vertical et du texte rouge. C'est maintenant un bloc teinté : sur un
 * formulaire dense en bleu et blanc, un simple trait de couleur se perd dans la grille
 * des champs, alors qu'une surface se repère sans qu'on la cherche. La couleur ne porte
 * toujours rien seule — le texte dit ce qui ne va pas, et `role="alert"` l'annonce.
 */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:col-span-2"
    >
      {children}
    </p>
  )
}
