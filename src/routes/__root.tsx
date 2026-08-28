/// <reference types="vite/client" />
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'

import { I18nProvider } from '~/i18n/provider'
import { DEFAULT_LOCALE, isLocale, localeDirection, type Locale } from '~/i18n/locales'
import { ErrorState, NotFoundState } from '~/ui/feedback/states'
import { TopProgress } from '~/ui/feedback/top-progress'
import { THEME_INIT_SCRIPT } from '~/ui/theme/theme'
import appCss from '~/styles/app.css?url'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
    // Le script de thème passe par `head()` et non par un <script> écrit à la main
    // dans le JSX : sinon l'ordre des enfants de <head> diffère entre le rendu
    // serveur et l'hydratation, et React refait tout le document.
    scripts: [{ children: THEME_INIT_SCRIPT }],
  }),
  shellComponent: RootDocument,
  errorComponent: ({ error, reset }) => <ErrorState error={error} reset={reset} />,
  notFoundComponent: () => <NotFoundState />,
})

/**
 * Document complet. La langue et le sens de lecture sont posés sur `<html>` dès le
 * rendu serveur : un changement de `dir` après hydratation ferait sauter toute la page.
 */
function RootDocument({ children }: { children: React.ReactNode }) {
  const locale = useLocaleFromPath()

  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {/*
          SANS JAVASCRIPT, RIEN N'EST CACHÉ.

          Les blocs de la vitrine sont rendus en `data-reveal="pending"`, donc à
          `opacity: 0`, et c'est l'observateur d'intersection qui les révèle. Poser cet
          état seulement après hydratation éviterait le problème mais ferait CLIGNOTER
          la page : le texte s'affiche, disparaît, revient.

          On le pose donc dès le serveur, et on annule la règle ici quand aucun script
          ne s'exécute. Une vitrine dont le texte reste invisible parce qu'un script a
          échoué ne vend rien — et c'est le mode dégradé le moins cher qui existe.
        */}
        <noscript>
          <style>{'[data-reveal]{opacity:1 !important;transform:none !important}'}</style>
        </noscript>

        <I18nProvider locale={locale}>
          <TopProgress />
          {children}
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  )
}

/**
 * La langue vient de l'URL, pas d'un état ni d'un cookie : `/fr/...`, `/ar/...`,
 * `/en/...`. C'est ce qui rend une page partageable et indexable dans sa langue.
 */
function useLocaleFromPath(): Locale {
  return useRouterState({
    select: (state) => {
      const segment = state.location.pathname.split('/')[1]
      return isLocale(segment) ? segment : DEFAULT_LOCALE
    },
  })
}
