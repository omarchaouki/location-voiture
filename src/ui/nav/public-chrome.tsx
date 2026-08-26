import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Locale } from '~/i18n/locales'
import { LanguageSwitcher } from '~/ui/i18n/language-switcher'
import { Button } from '~/ui/shadcn/button'
import { Separator } from '~/ui/shadcn/separator'
import { ThemeMenu } from '~/ui/theme/theme'

/**
 * Chrome des pages PUBLIQUES — vitrine, connexion, invitation, `/design`.
 *
 * Il vivait dans la couche de langue, donc au-dessus de TOUT le produit : l'espace de
 * travail affichait un en-tête de site marchand, puis son propre en-tête, puis sa
 * navigation. Trois bandeaux avant la première donnée utile. Les pages publiques le
 * portent maintenant elles-mêmes, et les espaces connectés ont leur propre coquille.
 *
 * **Refonte shadcn/ui du 26/08/2026.** Trois choses ont changé, et une seule est
 * cosmétique :
 *
 *  1. l'en-tête devient COLLANT. Sur une vitrine qui fait cinq écrans de haut, la
 *     seule action qui compte — se connecter — ne doit pas demander de remonter ;
 *  2. le thème et la langue sont deux menus de 44 px au lieu d'une rangée de six
 *     libellés. À 375 px, l'ancienne rangée débordait de 127 px, et
 *     `overflow-x: hidden` la coupait en silence ;
 *  3. « Se connecter » est un vrai bouton, à la fin de la ligne. C'était un lien
 *     souligné perdu au milieu de la vitrine.
 */
export function PublicChrome({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-30 border-b border-rule bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-2 sm:px-6">
          <Link
            to="/$lang"
            params={{ lang: locale }}
            className="flex items-center gap-2.5 rounded-sm"
            style={{ minHeight: 'var(--tap-target)' }}
          >
            <BrandMark />
            <span className="font-display text-md font-semibold tracking-tight">
              {t('brand.name')}
            </span>
          </Link>

          {/* La signature ne s'affiche qu'à partir de `lg` : en dessous, elle vole la
              place des commandes de droite sans rien apprendre à personne. */}
          <span className="hidden text-xs text-muted lg:inline">{t('brand.tagline')}</span>

          <div className="ms-auto flex items-center gap-1">
            <ThemeMenu />
            <LanguageSwitcher current={locale} />
            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
            <Button asChild variant="outline" size="sm" className="hidden h-11 sm:inline-flex">
              <Link to="/$lang/connexion" params={{ lang: locale }}>
                {t('auth.signIn')}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="content" className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>

      {/*
        Le pied de page n'existe que pour les pages légales : elles doivent être
        atteignables depuis n'importe quelle page publique, c'est la condition pour
        qu'elles servent à quelque chose. Rien d'autre n'y entre — un pied de page qui
        grossit devient un second menu que personne ne lit.
      */}
      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-muted sm:px-6">
          <span>{t('site.copyright', { year: new Date().getUTCFullYear() })}</span>
          <Link
            to="/$lang/mentions-legales"
            params={{ lang: locale }}
            className="transition-colors hover:text-ink"
          >
            {t('legal.notice.title')}
          </Link>
          <Link
            to="/$lang/confidentialite"
            params={{ lang: locale }}
            className="transition-colors hover:text-ink"
          >
            {t('legal.privacy.title')}
          </Link>
          {/* Sur téléphone le bouton de connexion de l'en-tête est masqué : il faut
              qu'une porte reste ouverte quelque part. */}
          <Link
            to="/$lang/connexion"
            params={{ lang: locale }}
            className="ms-auto transition-colors hover:text-ink sm:hidden"
          >
            {t('auth.signIn')}
          </Link>
        </div>
      </footer>
    </div>
  )
}

/**
 * La marque.
 *
 * Un carré à l'angle adouci, portant deux barres : la flotte alignée, vue de dessus.
 * Dessiné à la main plutôt qu'emprunté à lucide — c'est le seul signe du produit qui
 * lui appartient vraiment, et il doit survivre à un changement de bibliothèque
 * d'icônes.
 */
function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-stamp"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor">
        <g className="text-stamp-contrast" strokeWidth={2.5} strokeLinecap="round">
          <path d="M5 9h14" />
          <path d="M5 15h9" />
        </g>
      </svg>
    </span>
  )
}
