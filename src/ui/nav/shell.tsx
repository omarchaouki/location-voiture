import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { Locale } from '~/i18n/locales'
import type { ViewerState } from '~/server/session'
import { AccountMenu } from '~/ui/account/account-menu'
import { LanguageSwitcher } from '~/ui/i18n/language-switcher'
import { ThemeMenu } from '~/ui/theme/theme'
import type { Destination } from './destinations'

/**
 * COQUILLE DES ESPACES CONNECTÉS — client et plateforme.
 *
 * Avant : deux en-têtes empilés (celui de la vitrine, puis celui de l'application),
 * une rangée de liens soulignés, et le contenu qui commençait au tiers de l'écran.
 * C'est la disposition d'un site, pas celle d'un outil qu'on garde ouvert la journée.
 *
 * Maintenant : **barre latérale à partir de 1024 px, bande défilante en dessous**.
 * La règle vient du comportement, pas de la mode — sur écran large, la navigation
 * reste visible pendant qu'on travaille dans la colonne de droite ; sur téléphone,
 * une colonne fixe mangerait la moitié de la largeur utile.
 *
 * Ce qui n'a PAS changé, parce que c'était déjà mesuré :
 *  - la bande de téléphone défile horizontalement plutôt que de se replier derrière
 *    un menu — une navigation cachée est une navigation oubliée ;
 *  - le compte reste hors du défilement : une sortie qu'il faut aller chercher en
 *    glissant n'est pas une sortie ;
 *  - toutes les cibles font 44 px de haut.
 */

/*
 * ÉTAT ACTIF — un aplat gris, pas une pastille colorée.
 *
 * La version précédente peignait la rubrique courante en vert sur fond vert clair.
 * C'est lisible, et c'est exactement ce qui fait « thème appliqué par-dessus » : la
 * couleur de marque sert alors à dire « vous êtes ici », alors qu'elle ne devrait
 * dire que « faites ceci ». Les consoles qu'on prend pour modèle marquent la
 * rubrique courante par un aplat neutre et une graisse, et gardent la couleur pour
 * l'ICÔNE seule — présence de la marque, sans confusion de rôle.
 */
const SIDE_LINK =
  'group flex items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground'

const SIDE_ICON = 'shrink-0 text-muted-foreground group-aria-[current=page]:text-primary'

const STRIP_LINK =
  'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground'

const TAP = { minHeight: 'var(--tap-target)' } as const

/**
 * PASTILLE DE RUBRIQUE — le compteur de notifications, là où il a un sens.
 *
 * Il vivait dans une cloche séparée, à côté du menu de compte. C'était une deuxième
 * porte vers la même chose : la rubrique « Alertes » était déjà dans la navigation,
 * et deux entrées pour un seul sujet obligent à choisir laquelle regarder. La pastille
 * est donc posée SUR la rubrique — comme le fait n'importe quelle messagerie — et la
 * page des alertes redevient le seul centre de notifications.
 *
 * Le nombre est ÉCRIT, jamais un simple point de couleur : un point rouge ne dit pas
 * s'il reste une échéance ou douze, et il est muet pour un lecteur d'écran. Le libellé
 * complet part dans un `sr-only` collé au lien, pour être annoncé avec lui.
 */
const MAX_BADGE = 99

function NavBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null

  return (
    <>
      <span
        aria-hidden="true"
        className="numeric ms-auto grid min-w-5 shrink-0 place-items-center rounded-full bg-destructive px-1.5 py-0.5 text-2xs font-medium text-destructive-foreground"
      >
        {count > MAX_BADGE ? `${MAX_BADGE}+` : count}
      </span>
      <span className="sr-only">{label}</span>
    </>
  )
}

/**
 * Bande défilante — la navigation sur téléphone, et la seule surface de `/design`
 * où on peut la mesurer à 320, 375 et 768 px sans ouvrir de session.
 */
export function NavStrip({
  locale,
  destinations,
  label,
  badges,
}: {
  locale: Locale
  destinations: readonly Destination[]
  label: string
  /** Compteurs par destination (`to` → nombre). Zéro ou absent = pas de pastille. */
  badges?: Readonly<Record<string, number>>
}) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={label}
      className="nav-strip -ms-4 flex flex-1 ps-4 sm:-ms-6 sm:ps-6 lg:hidden"
    >
      {destinations.map((destination) => (
        <Link
          key={destination.to}
          to={destination.to}
          params={{ lang: locale }}
          {...(destination.exact ? { activeOptions: { exact: true } } : {})}
          className={STRIP_LINK}
          style={TAP}
        >
          <destination.icon size={17} className={SIDE_ICON} />
          {t(destination.key)}
          <NavBadge
            count={badges?.[destination.to] ?? 0}
            label={t('alerts.bell.unread', { count: badges?.[destination.to] ?? 0 })}
          />
        </Link>
      ))}
    </nav>
  )
}

/**
 * Le rail vertical — la navigation à partir de 1024 px.
 *
 * Extrait de la coquille pour la même raison que la bande : `/design` est la seule
 * surface où on peut le regarder sans ouvrir de session, et une navigation qu'on ne
 * peut pas regarder est une navigation qu'on ne corrige jamais.
 */
export function SideRail({
  locale,
  destinations,
  label,
  badges,
}: {
  locale: Locale
  destinations: readonly Destination[]
  label: string
  badges?: Readonly<Record<string, number>>
}) {
  const { t } = useTranslation()

  return (
    <nav aria-label={label} className="flex flex-1 flex-col gap-0.5 px-3 pb-3">
      {destinations.map((destination) => (
        <Link
          key={destination.to}
          to={destination.to}
          params={{ lang: locale }}
          {...(destination.exact ? { activeOptions: { exact: true } } : {})}
          className={SIDE_LINK}
          style={TAP}
        >
          <destination.icon size={18} className={SIDE_ICON} />
          {t(destination.key)}
          <NavBadge
            count={badges?.[destination.to] ?? 0}
            label={t('alerts.bell.unread', { count: badges?.[destination.to] ?? 0 })}
          />
        </Link>
      ))}
    </nav>
  )
}

export function Shell({
  locale,
  viewer,
  destinations,
  home,
  subtitle,
  banners,
  badges,
  children,
}: {
  locale: Locale
  viewer: ViewerState
  destinations: readonly Destination[]
  /** Où mène le nom du produit dans cette coquille. */
  home: string
  /** Ligne discrète sous la marque : le nom de l'agence, ou « plateforme ». */
  subtitle?: ReactNode
  /** Bandeaux qui ont le droit d'interrompre (impersonation, démo, échéances). */
  banners?: ReactNode
  /**
   * Compteurs de navigation (`to` → nombre), pour la pastille rouge.
   *
   * Calculés par la ROUTE, pas ici : la coquille sert aussi `/admin`, qui n'a pas
   * d'échéances, et une coquille qui sonderait elle-même imposerait ce sondage aux
   * deux espaces.
   */
  badges?: Readonly<Record<string, number>>
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="lg:flex lg:min-h-dvh">
      {/* ---- Barre latérale : à partir de 1024 px seulement ---- */}
      {/* La navigation ne s'imprime pas : une feuille qui sort de l'application
          n'a plus rien à naviguer. */}
      <aside data-print="hide" className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-e lg:border-border lg:bg-card">
        <div className="px-4 py-4">
          <Link to={home} params={{ lang: locale }} className="text-base font-semibold">
            {t('brand.name')}
          </Link>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>

        <SideRail
          locale={locale}
          destinations={destinations}
          label={t('nav.primary')}
          {...(badges === undefined ? {} : { badges })}
        />

        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center gap-3">
            <ThemeMenu />
            <LanguageSwitcher current={locale} />
          </div>
          <AccountMenu viewer={viewer} locale={locale} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---- En-tête de téléphone et de tablette ---- */}
        <header data-print="hide" className="sticky top-0 z-20 border-b border-border bg-card lg:hidden">
          <div className="flex items-center gap-3 px-4 py-2 sm:px-6">
            <Link to={home} params={{ lang: locale }} className="text-base font-semibold">
              {t('brand.name')}
            </Link>
            <div className="ms-auto flex items-center gap-1 sm:gap-3">
              <ThemeMenu />
              <LanguageSwitcher current={locale} />
              <AccountMenu viewer={viewer} locale={locale} />
            </div>
          </div>
          <div className="flex items-stretch px-4 sm:px-6">
            <NavStrip
              locale={locale}
              destinations={destinations}
              label={t('nav.primary')}
              {...(badges === undefined ? {} : { badges })}
            />
          </div>
        </header>

        {banners ? (
          <div data-print="hide" className="border-b border-border">
            {banners}
          </div>
        ) : null}

        <main
          id="content"
          className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
