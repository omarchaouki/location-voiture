import { useTranslation } from 'react-i18next'

import { Combobox } from './combobox'

/**
 * Champs de formulaire.
 *
 * Volontairement nus : bordure au filet, pas d'ombre, hauteur de cible tactile de
 * 44 px, et un vrai `<label>` qui enveloppe le champ — pas un `aria-label` posé
 * par-dessus. Un registre se remplit au stylo, pas dans une carte flottante.
 */

const INPUT_CLASS =
  'mt-1 block w-full rounded-sm border border-input bg-card px-3 py-2 text-base transition-colors focus:border-primary'

export function Field({
  name,
  label,
  hint,
  type = 'text',
  required,
  defaultValue,
  numeric = true,
  pattern,
  autoComplete,
  className,
}: {
  name: string
  label: string
  hint?: string
  type?: string
  required?: boolean
  defaultValue?: string
  /** Chiffres tabulaires par défaut : plaques, montants, dates s'alignent. */
  numeric?: boolean
  /**
   * Contrainte de forme. Le tiret doit y être ÉCHAPPÉ (`[a-z0-9\-]+`) : les attributs
   * `pattern` sont compilés avec le drapeau `v`, où un tiret nu en fin de classe est
   * une erreur de syntaxe qui fait échouer `requestSubmit()` sur tout le formulaire.
   */
  pattern?: string
  autoComplete?: string
  className?: string
}) {
  return (
    <label className={`block ${className ?? ''}`.trim()}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        pattern={pattern}
        autoComplete={autoComplete}
        className={`${numeric ? 'numeric ' : ''}${INPUT_CLASS}`}
        style={{ minHeight: 'var(--tap-target)' }}
      />
      {hint ? <span className="mt-1 block text-2xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export function TextArea({
  name,
  label,
  rows = 3,
}: {
  name: string
  label: string
  rows?: number
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <textarea name={name} rows={rows} className={INPUT_CLASS} />
    </label>
  )
}

export function Select({
  name,
  label,
  options,
  prefix,
  defaultValue,
}: {
  name: string
  label: string
  options: readonly string[]
  /** Préfixe de clé i18n : les valeurs d'énumération se traduisent aussi. */
  prefix: string
  defaultValue?: string
}) {
  const { t } = useTranslation()

  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className={INPUT_CLASS}
        style={{ minHeight: 'var(--tap-target)' }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`${prefix}.${option}`)}
          </option>
        ))}
      </select>
    </label>
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

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="border-s-2 border-destructive ps-3 text-sm text-destructive sm:col-span-2">
      {children}
    </p>
  )
}
