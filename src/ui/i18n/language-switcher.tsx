import { Link } from '@tanstack/react-router'
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LOCALE_NAMES, LOCALES, type Locale } from '~/i18n/locales'
import { Button } from '~/ui/shadcn/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '~/ui/shadcn/dropdown-menu'

/**
 * Sélecteur de langue.
 *
 * **Il était invisible sur téléphone, et pas par accident.** Trois noms de langue
 * écrits en toutes lettres — « Français », « العربية », « English » — dans une rangée
 * `flex`, cela fait 199 px. Mesuré sur la page d'accueil à 375 px : la rangée
 * d'en-tête portait 502 px de contenu dans 375 px de large. `body { overflow-x: hidden }`
 * les coupait proprement, et le garde-fou masquait le défaut au lieu de le signaler.
 *
 * Un menu résout les deux : un seul déclencheur de 44 px quelle que soit la largeur,
 * et la langue courante lisible sans ouvrir.
 *
 * **Ce qui n'a PAS été sacrifié en passant à shadcn** : les entrées restent de vrais
 * liens `<a href>` avec `hreflang`. La langue est dans l'URL, changer de langue est
 * une NAVIGATION ; des boutons qui appelleraient le routeur perdraient l'indexation,
 * l'ouverture dans un nouvel onglet et le partage. C'est la raison pour laquelle
 * `DropdownMenuItem` est utilisé en `asChild` plutôt qu'avec un `onSelect`.
 */
export function LanguageSwitcher({ current }: { current: Locale }) {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2.5" aria-label={t('language.label')}>
          <Globe className="size-[18px] text-muted-foreground" aria-hidden="true" />
          {/*
            Le code sur deux lettres suffit et tient partout ; le nom complet est dans
            le panneau. Écrire « Français » dans le déclencheur ramènerait le
            débordement qu'on vient de corriger.
          */}
          <span className="text-xs uppercase tracking-wide">{current}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('language.label')}</DropdownMenuLabel>
        {LOCALES.map((locale) => (
          <DropdownMenuItem key={locale} asChild>
            {/*
              `to="."` garde le chemin courant et ne change que le segment de langue.
              Un lien vers `/${locale}` renverrait à l'accueil : on perdrait la page
              qu'on était en train de lire, ce qui est exactement ce qu'un sélecteur
              de langue ne doit jamais faire.
            */}
            <Link
              to="."
              params={{ lang: locale }}
              hrefLang={locale}
              lang={locale}
              aria-current={locale === current ? 'true' : undefined}
              className="flex w-full items-center gap-2"
            >
              <span className="flex-1">{LOCALE_NAMES[locale]}</span>
              {/* Le code courant reste lisible sans dépendre de la couleur. */}
              {locale === current ? (
                <span className="text-2xs uppercase text-primary">{locale}</span>
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
