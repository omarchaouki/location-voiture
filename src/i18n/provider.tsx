import { useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'

import { createI18n } from './index'
import { localeDirection, type Locale } from './locales'

/**
 * Fournit une instance i18next au sous-arbre React.
 *
 * Une instance par arbre (donc une par requête côté serveur) : aucune instance
 * globale, sinon la langue d'un visiteur fuirait vers le suivant en SSR.
 */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale
  children: React.ReactNode
}) {
  const [instance] = useState(() => createI18n(locale))

  // Le changement de langue est une navigation (/fr → /ar), pas un état local :
  // on synchronise l'instance existante plutôt que d'en recréer une.
  if (instance.language !== locale) {
    void instance.changeLanguage(locale)
  }

  useEffect(() => {
    const html = document.documentElement
    html.lang = locale
    html.dir = localeDirection(locale)
  }, [locale])

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>
}
