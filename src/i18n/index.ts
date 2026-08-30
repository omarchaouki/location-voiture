import { createInstance, type i18n as I18nInstance } from 'i18next'

import arCommon from './locales/ar/common.json'
import enCommon from './locales/en/common.json'
import esCommon from './locales/es/common.json'
import frCommon from './locales/fr/common.json'
import { DEFAULT_LOCALE, type Locale } from './locales'

export const NAMESPACES = ['common'] as const
export const DEFAULT_NAMESPACE = 'common'

/**
 * LES QUATRE DICTIONNAIRES, empaquetés avec l'application.
 *
 * **Ils pèsent 64 ko gzip dans le paquet d'entrée**, mesurés le 29/08/2026 en ajoutant
 * l'espagnol : 16,1 pour le français, 17,5 pour l'arabe, 14,4 pour l'anglais, 15,8 pour
 * l'espagnol. Trois quarts de ce poids ne seront jamais lus par un visiteur donné, et
 * `pnpm check:budget` a raison de le signaler — c'est exactement le genre de dérive
 * qu'il existe pour attraper.
 *
 * **Le découpage par langue a été tenté le 29/08/2026, et retiré.** `import()` par
 * langue, chargé par le `beforeLoad` de la route racine : le rendu SERVEUR sortait bien
 * en espagnol, et l'hydratation repartait sur des clés brutes — TanStack Start ne
 * rejoue pas `beforeLoad` avant d'hydrater une page déjà rendue, donc l'instance
 * i18next naissait côté navigateur sans son dictionnaire. Le symptôme est le pire
 * possible : une page correcte au premier octet, illisible une demi-seconde plus tard.
 *
 * Ce qu'il faudrait pour y revenir : que le module d'entrée CLIENT attende le
 * dictionnaire avant `hydrateRoot`. C'est faisable, mais cela touche l'amorçage de
 * l'application, pas l'internationalisation — et cela ne se tente pas à la fin d'une
 * phase. Consigné dans docs/AUDIT.md.
 */
const RESOURCES = {
  fr: { common: frCommon },
  ar: { common: arCommon },
  en: { common: enCommon },
  es: { common: esCommon },
} as const

/**
 * Une instance par requête.
 *
 * On n'utilise volontairement PAS `initReactI18next` : il installe une instance
 * globale, ce qui sur un serveur SSR ferait fuiter la langue d'un visiteur vers
 * le suivant. La liaison à React se fait par `<I18nextProvider>`, dans __root.
 */
export function createI18n(locale: Locale): I18nInstance {
  const instance = createInstance()

  void instance.init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: Object.keys(RESOURCES),
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    resources: RESOURCES,
    // React échappe déjà ; laisser i18next échapper produit des `&#39;` visibles.
    interpolation: { escapeValue: false },
    // Les ressources sont empaquetées : rien à charger, donc rien à suspendre.
    react: { useSuspense: false },
    returnNull: false,
  })

  return instance
}

export type TranslationResources = typeof RESOURCES
