import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Locale } from '~/i18n/locales'
import { LanguageSwitcher } from '~/ui/i18n/language-switcher'
import { ThemeToggle } from '~/ui/theme/theme'

/**
 * Chrome des pages PUBLIQUES — vitrine, connexion, invitation, `/design`.
 *
 * Il vivait dans la couche de langue, donc au-dessus de TOUT le produit : l'espace
 * de travail affichait un en-tête de site marchand, puis son propre en-tête, puis sa
 * navigation. Trois bandeaux avant la première donnée utile.
 *
 * Les pages publiques le portent maintenant elles-mêmes, et les espaces connectés
 * ont leur propre coquille (`Shell`). Deux publics, deux chromes.
 */
export function PublicChrome({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/$lang"
            params={{ lang: locale }}
            className="font-display text-md font-semibold tracking-tight"
          >
            {t('brand.name')}
          </Link>
          <span className="hidden text-xs text-muted sm:inline">{t('brand.tagline')}</span>
          <div className="ms-auto flex items-center gap-4">
            <ThemeToggle />
            <LanguageSwitcher current={locale} />
          </div>
        </div>
      </header>

      <main id="content" className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>

      {/*
        Le pied de page n'existe que pour les pages légales : elles doivent être
        atteignables depuis n'importe quelle page publique, c'est la condition pour
        qu'elles servent à quelque chose. Rien d'autre n'y entre — un pied de page
        qui grossit devient un second menu que personne ne lit.
      */}
      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-muted sm:px-6">
          <span>{t('site.copyright', { year: new Date().getUTCFullYear() })}</span>
          <Link
            to="/$lang/mentions-legales"
            params={{ lang: locale }}
            className="hover:text-ink"
          >
            {t('legal.notice.title')}
          </Link>
          <Link
            to="/$lang/confidentialite"
            params={{ lang: locale }}
            className="hover:text-ink"
          >
            {t('legal.privacy.title')}
          </Link>
        </div>
      </footer>
    </div>
  )
}
