import { createFileRoute, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { PublicChrome } from '~/ui/nav/public-chrome'

/**
 * Couche de langue. Toute page du produit — vitrine, application, back-office —
 * vit sous `/fr`, `/ar` ou `/en`.
 *
 * Une langue inconnue renvoie 404 : on ne devine pas, et on ne laisse pas
 * `/xx/vehicules` répondre 200 avec un contenu français.
 */
export const Route = createFileRoute('/$lang')({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.lang)) throw notFound()
    return { locale: params.lang }
  },
  component: LanguageLayout,
})

function LanguageLayout() {
  const { t } = useTranslation()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const connected = useIsConnectedArea()

  /*
   * DEUX CHROMES, UNE SEULE DÉCISION.
   *
   * Cette couche portait l'en-tête de la vitrine, donc au-dessus de TOUT le produit :
   * l'espace de travail affichait un en-tête de site marchand, puis son propre
   * en-tête, puis sa navigation. Trois bandeaux avant la première donnée utile.
   *
   * Les espaces connectés ont maintenant leur propre coquille (`Shell`, barre
   * latérale) et ne veulent pas de chrome public. Le choix se fait ici, en un seul
   * endroit, plutôt que d'être recopié dans les quatre pages publiques — où il aurait
   * fini par diverger.
   *
   * Le lien d'évitement, lui, reste commun : il doit être le tout premier élément
   * focusable du document, quelle que soit la page.
   */
  return (
    <div className="min-h-dvh">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:rounded-md focus:border focus:border-rule-strong focus:bg-surface focus:px-3 focus:py-2"
      >
        {t('nav.skipToContent')}
      </a>

      {connected ? <Outlet /> : <PublicChrome locale={locale}><Outlet /></PublicChrome>}
    </div>
  )
}

/**
 * `/fr/app/...` et `/fr/admin/...` sont les espaces connectés. Le test porte sur le
 * SEGMENT, pas sur une inclusion de chaîne : une agence nommée « app » dans une URL
 * de vitrine ne doit pas faire disparaître l'en-tête public.
 */
function useIsConnectedArea(): boolean {
  return useRouterState({
    select: (state) => {
      const segment = state.location.pathname.split('/')[2]
      return segment === 'app' || segment === 'admin'
    },
  })
}
