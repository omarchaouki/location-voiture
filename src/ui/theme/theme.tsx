import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'registre.theme'

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

export function ThemeToggle() {
  const { t } = useTranslation()
  const { choice, setChoice } = useTheme()

  return (
    <fieldset className="flex items-center gap-0 border border-rule" aria-label={t('theme.label')}>
      {ORDER.map((option) => (
        <label
          key={option}
          // Cible tactile de 44 px : le réglage se fait au pouce, pas à la souris.
          style={{ minHeight: 'var(--tap-target)' }}
          className={`flex cursor-pointer items-center px-3 text-2xs tracking-wide uppercase ${
            choice === option ? 'bg-stamp text-stamp-contrast' : 'text-muted hover:text-ink'
          }`}
        >
          <input
            type="radio"
            name="theme"
            value={option}
            checked={choice === option}
            onChange={() => setChoice(option)}
            className="sr-only"
          />
          {t(`theme.${option}`)}
        </label>
      ))}
    </fieldset>
  )
}
