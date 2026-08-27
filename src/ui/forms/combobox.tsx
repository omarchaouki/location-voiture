// i18n-exempt — cette primitive ne produit aucun texte : libellés, options et
// messages lui sont passés déjà traduits par l'appelant.

import { useId, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * COMBOBOX — un champ qui se remplit en tapant.
 *
 * Un `<select>` natif est le bon outil pour cinq options. Au-delà, il devient une
 * épreuve : sur téléphone il ouvre une roulette qu'on fait défiler au pouce, et sur
 * ordinateur il n'accepte qu'une recherche par première lettre, sans correction et
 * sans mémoire. Choisir une ville marocaine dans une liste de soixante, ou un
 * véhicule dans une flotte de quarante, se fait en tapant trois lettres — pas en
 * faisant défiler.
 *
 * **Écrit à la main plutôt qu'installé.** Une bibliothèque de composants aurait
 * apporté ce champ et deux cents kilo-octets d'autre chose, dans un produit qui
 * mesure son paquet client à chaque construction. Le motif ARIA 1.2 « combobox +
 * listbox » tient en un fichier ; ce qui coûte, c'est de le respecter, pas de le
 * réécrire.
 *
 * Ce que cette primitive garantit :
 *
 *  - **`role="combobox"` + `aria-expanded` + `aria-controls`** sur le champ, et
 *    `aria-activedescendant` sur l'option survolée au clavier. Le focus ne quitte
 *    JAMAIS le champ : c'est ce qui permet de continuer à taper pendant qu'on
 *    parcourt la liste, et c'est la moitié du motif que les implémentations
 *    maison ratent le plus souvent.
 *  - **Clavier complet** : ↓ ↑ pour parcourir, Début / Fin pour les extrémités,
 *    Entrée pour choisir, Échap pour refermer sans choisir.
 *  - **Un `aria-live` discret** annonce le nombre de résultats. Sans lui, un
 *    utilisateur de lecteur d'écran tape dans le vide.
 *  - **Deux modes.** `free` laisse écrire n'importe quoi — une ville hors liste
 *    reste une ville. `strict` impose un choix et porte la valeur dans un champ
 *    caché : l'identifiant d'un véhicule n'est pas du texte libre.
 */

export interface ComboboxOption {
  value: string
  label: string
  /** Seconde ligne : plaque, téléphone, code — ce qui distingue deux homonymes. */
  detail?: string
}

function normalize(input: string): string {
  return input
    .toLocaleLowerCase()
    .normalize('NFD')
    /*
     * Les accents sont retirés des DEUX côtés de la comparaison : « Kenitra » doit
     * trouver « Kénitra ». Sans cela, le champ punit exactement l'utilisateur qui
     * tape vite, c'est-à-dire celui qui s'en sert tous les jours.
     */
    .replace(/[̀-ͯ]/g, '')
}

export function Combobox({
  name,
  label,
  options,
  mode = 'free',
  required = false,
  defaultValue = '',
  hint,
  placeholder,
  emptyLabel,
  countLabel,
  onValueChange,
  layout = 'field',
}: {
  name: string
  label: string
  options: readonly ComboboxOption[]
  /** `free` : texte libre accepté. `strict` : seule une option de la liste compte. */
  mode?: 'free' | 'strict'
  required?: boolean
  defaultValue?: string
  hint?: ReactNode
  placeholder?: string
  /** Message quand rien ne correspond, déjà traduit. */
  emptyLabel: string
  /** Annonce du nombre de résultats, déjà traduite et interpolée. */
  countLabel: (count: number) => string
  /**
   * Prévient l'appelant d'un choix.
   *
   * Nécessaire, et pas par confort : en mode strict la valeur voyage dans un champ
   * CACHÉ, et un champ caché dont React change la valeur n'émet aucun événement
   * `change`. Un formulaire qui recalcule un aperçu sur `onChange` — celui des
   * contrats calcule le prix — ne verrait jamais passer le choix du véhicule.
   */
  onValueChange?: (value: string) => void
  /**
   * `field` : libellé visible au-dessus, largeur pleine — le cas ordinaire.
   * `inline` : compact, libellé porté par `aria-label`, pour une action posée DANS
   * une ligne de tableau. Le libellé visible n'y a pas sa place — la colonne le
   * nomme déjà — mais il doit rester annoncé.
   */
  layout?: 'field' | 'inline'
}) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const initial = useMemo(
    () => options.find((option) => option.value === defaultValue),
    [options, defaultValue],
  )

  const [query, setQuery] = useState(initial?.label ?? defaultValue)
  const [selected, setSelected] = useState<string>(initial?.value ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const matches = useMemo(() => {
    const needle = normalize(query.trim())
    if (needle.length === 0) return options.slice(0, 50)
    return options
      .filter((option) => {
        const haystack = normalize(`${option.label} ${option.detail ?? ''}`)
        return haystack.includes(needle)
      })
      .slice(0, 50)
  }, [options, query])

  function choose(option: ComboboxOption) {
    setQuery(option.label)
    setSelected(option.value)
    setOpen(false)
    setActive(-1)
    inputRef.current?.focus()
    onValueChange?.(option.value)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        setActive(0)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => {
        const next = current + step
        if (next < 0) return matches.length - 1
        if (next >= matches.length) return 0
        return next
      })
      return
    }

    if (event.key === 'Home' && open) {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === 'End' && open) {
      event.preventDefault()
      setActive(matches.length - 1)
      return
    }

    if (event.key === 'Enter' && open && active >= 0) {
      const option = matches[active]
      if (option) {
        // On n'empêche le défaut QUE si l'on consomme la touche : sinon on
        // bloquerait l'envoi du formulaire depuis un champ replié.
        event.preventDefault()
        choose(option)
      }
      return
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
      setActive(-1)
    }
  }

  /*
   * En mode strict, quitter le champ sans avoir choisi remet le texte à l'état
   * précédent. Laisser « Casa » dans un champ dont la valeur réelle est vide fait
   * croire à une saisie enregistrée, et l'erreur n'apparaît qu'à l'envoi.
   */
  function onBlur() {
    window.setTimeout(() => {
      setOpen(false)
      setActive(-1)
      if (mode !== 'strict') return
      const match = options.find((option) => option.value === selected)
      setQuery(match?.label ?? '')
    }, 120)
  }

  const activeId = active >= 0 && matches[active] ? `${listId}-${active}` : undefined

  return (
    <div className={layout === 'inline' ? 'relative w-56 max-w-full' : 'relative'}>
      <label className={layout === 'inline' ? 'block' : 'block'}>
        {layout === 'field' ? (
          <span className="text-xs text-muted-foreground">
            {label}
            {required ? <span aria-hidden="true"> *</span> : null}
          </span>
        ) : null}
        <input
          ref={inputRef}
          role="combobox"
          type="text"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-label={layout === 'inline' ? label : undefined}
          required={required}
          placeholder={placeholder}
          value={query}
          // En mode libre, le champ EST la valeur : il porte le `name`.
          name={mode === 'free' ? name : undefined}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setActive(-1)
            if (mode === 'strict') {
              setSelected('')
              onValueChange?.('')
            } else {
              onValueChange?.(event.target.value)
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={`block w-full rounded-md border border-input bg-card transition-colors focus:border-primary ${
            layout === 'inline' ? 'px-2 py-1 text-sm' : 'mt-1 px-3 py-2 text-base'
          }`}
          style={{ minHeight: 'var(--tap-target)' }}
        />
      </label>

      {/* En mode strict, la valeur réelle voyage à part. */}
      {mode === 'strict' ? <input type="hidden" name={name} value={selected} /> : null}

      {hint ? <span className="mt-1 block text-2xs text-muted-foreground">{hint}</span> : null}

      {/* Annonce discrète : sans elle, taper dans le champ ne dit rien à qui n'y voit pas. */}
      <span aria-live="polite" className="sr-only">
        {open ? countLabel(matches.length) : ''}
      </span>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card py-1"
          style={{ boxShadow: 'var(--shadow-overlay)' }}
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</li>
          ) : (
            matches.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                /*
                 * `onMouseDown` et non `onClick` : le `blur` du champ part avant le
                 * `click`, et referme la liste sous le curseur. Choisir une ville à
                 * la souris ne faisait alors strictement rien.
                 */
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(option)
                }}
                onMouseEnter={() => setActive(index)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  index === active ? 'bg-muted text-foreground' : 'text-foreground'
                }`}
              >
                {option.label}
                {option.detail ? (
                  <span className="numeric block text-xs text-muted-foreground">{option.detail}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
