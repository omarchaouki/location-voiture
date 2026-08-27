import { Monitor, Moon, Sun } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '~/ui/shadcn/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/ui/shadcn/dropdown-menu'

export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'flotta.theme'

/**
 * Script posé dans `<head>`, avant tout rendu.
 *
 * Sans lui, une page choisie en sombre s'affiche une frame en clair : c'est le
 * « flash » que tout le monde connaît. Il est volontairement minuscule et sans
 * dépendance ; il ne fait qu'écrire l'attribut que `tokens.css` sait lire.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`

/*
 * Le thème est un état EXTERNE à React : il vit dans `localStorage` et dans un
 * attribut du DOM, écrits tous les deux avant l'hydratation. On le lit donc avec
 * `useSyncExternalStore` plutôt qu'avec un `useState` + `useEffect`, qui
 * provoquerait un rendu en cascade au montage.
 */

const listeners = new Set<() => void>()

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // Un autre onglet peut changer le thème.
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    // Navigation privée ou stockage refusé : on reste sur « système ».
    return 'system'
  }
}

/** Le serveur ne connaît pas la préférence : il rend « système », et le script du <head> corrige. */
function readServerChoice(): ThemeChoice {
  return 'system'
}

export function useTheme(): {
  choice: ThemeChoice
  setChoice: (next: ThemeChoice) => void
} {
  const choice = useSyncExternalStore(subscribe, readChoice, readServerChoice)

  const setChoice = useCallback((next: ThemeChoice) => {
    const html = document.documentElement
    if (next === 'system') {
      html.removeAttribute('data-theme')
    } else {
      html.setAttribute('data-theme', next)
    }
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // L'affichage est déjà correct ; la persistance est un bonus.
    }
    for (const listener of listeners) listener()
  }, [])

  return { choice, setChoice }
}

const ORDER: ReadonlyArray<ThemeChoice> = ['system', 'light', 'dark']

const ICONS: Record<ThemeChoice, typeof Monitor> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

/**
 * SÉLECTEUR DE THÈME.
 *
 * C'était une rangée de trois segments — SYSTÈME / CLAIR / SOMBRE — écrits en toutes
 * lettres. Cela tenait 150 px dans une barre qui porte déjà la marque, la langue et
 * le compte, et sur téléphone les trois libellés poussaient le reste hors de l'écran.
 *
 * Un menu résout les deux : un seul déclencheur de 44 px quelle que soit la largeur,
 * et le choix courant lisible à l'icône sans ouvrir. C'est le même raisonnement que
 * pour la langue, et la même conclusion.
 *
 * Le déclencheur garde un `aria-label` : une icône seule ne se lit pas
 * (`aria-labels`), et la coche dans le panneau dit lequel est actif sans dépendre de
 * la couleur (`color-not-only`).
 */
export function ThemeMenu() {
  const { t } = useTranslation()
  const { choice, setChoice } = useTheme()
  const Current = ICONS[choice]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('theme.label')}>
          <Current className="size-[18px] text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('theme.label')}</DropdownMenuLabel>
        {ORDER.map((option) => {
          const Icon = ICONS[option]
          return (
            <DropdownMenuCheckboxItem
              key={option}
              checked={choice === option}
              onCheckedChange={() => setChoice(option)}
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>{t(`theme.${option}`)}</span>
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
