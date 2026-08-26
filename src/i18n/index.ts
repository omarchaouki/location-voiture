import { createInstance, type i18n as I18nInstance } from 'i18next'

import arCommon from './locales/ar/common.json'
import enCommon from './locales/en/common.json'
import frCommon from './locales/fr/common.json'
import { DEFAULT_LOCALE, type Locale } from './locales'

export const NAMESPACES = ['common'] as const
export const DEFAULT_NAMESPACE = 'common'

const RESOURCES = {
  fr: { common: frCommon },
  ar: { common: arCommon },
  en: { common: enCommon },
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
