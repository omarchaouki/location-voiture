import { useTranslation } from 'react-i18next'

import { LOCALE_NAMES, LOCALES, type Locale } from '~/i18n/locales'
import { CheckIcon, GlobeIcon } from '~/ui/icons'
import { Menu, MenuLink } from '~/ui/overlay/menu'

/**
 * Sélecteur de langue.
 *
 * **Il était invisible sur téléphone, et pas par accident.** Trois noms de langue
 * écrits en toutes lettres — « Français », « العربية », « English » — dans une
 * rangée `flex`, cela fait 199 px. Mesuré sur la page d'accueil à 375 px : la rangée
 * d'en-tête portait 502 px de contenu dans 375 px de large, et les trois liens
 * commençaient à x = 302 pour finir à x = 501. `body { overflow-x: hidden }`, posé
 * en Phase 10 pour empêcher la page de glisser de côté, les coupait proprement.
 * Le garde-fou masquait le défaut au lieu de le signaler.
 *
 * Un menu résout les deux : un seul déclencheur de 44 px quelle que soit la largeur,
 * et la langue courante lisible sans ouvrir. C'est aussi ce que font les consoles
 * d'administration qu'on prend pour modèle — la langue y vit dans un menu, jamais
 * étalée dans la barre.
 *
 * Ce qui n'a PAS été sacrifié : les entrées restent de vrais liens `<a href>` avec
 * `hreflang`. La langue est dans l'URL, changer de langue est une NAVIGATION ; des
 * boutons qui appellent le routeur perdraient l'indexation, l'ouverture dans un
 * nouvel onglet et le partage.
 */
export function LanguageSwitcher({ current }: { current: Locale }) {
  const { t } = useTranslation()

  return (
    <Menu
      label={t('language.label')}
      appearance="bare"
      width="compact"
      trigger={
        <>
          <GlobeIcon size={18} />
          {/*
            Le code sur deux lettres suffit et tient partout ; le nom complet est
            dans le panneau. Écrire « Français » dans le déclencheur ramènerait le
            débordement qu'on vient de corriger.
          */}
          <span className="text-xs tracking-wide uppercase">{current}</span>
        </>
      }
    >
      {LOCALES.map((locale) => (
        <MenuLink
          key={locale}
          to="."
          params={{ lang: locale }}
          hrefLang={locale}
          lang={locale}
          current={locale === current}
        >
          <span className="flex-1">{LOCALE_NAMES[locale]}</span>
          {/* La coche dit « c'est celle-ci » sans dépendre de la couleur. */}
          {locale === current ? <CheckIcon size={16} /> : null}
        </MenuLink>
      ))}
    </Menu>
  )
}
