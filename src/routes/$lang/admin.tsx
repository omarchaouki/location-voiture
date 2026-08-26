import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { fetchViewer } from '~/server/session'
import { ADMIN_DESTINATIONS } from '~/ui/nav/destinations'
import { Shell } from '~/ui/nav/shell'

/**
 * Back-office — moi seul.
 *
 * Le garde tourne côté serveur avant tout rendu, et il refuse aussi une session en
 * impersonation (`fetchViewer` met `isPlatformOwner` à faux dans ce cas) : un
 * administrateur en train de consulter un client ne doit pas pouvoir revenir ici
 * sans quitter l'impersonation.
 *
 * La coquille est la MÊME que celle du client (`Shell`) : même barre latérale, même
 * bande défilante sur téléphone, même menu de compte. Un back-office dessiné à part
 * dérive au premier changement, et c'est celui qu'on regarde le moins souvent qui
 * finit cassé.
 */
export const Route = createFileRoute('/$lang/admin')({
  beforeLoad: async ({ params }) => {
    const viewer = await fetchViewer()
    const lang = isLocale(params.lang) ? params.lang : DEFAULT_LOCALE
    if (!viewer) throw redirect({ to: '/$lang/connexion', params: { lang } })
    if (!viewer.isPlatformOwner) throw redirect({ to: '/$lang/app', params: { lang } })
    return { viewer }
  },
  loader: ({ context }) => ({ viewer: context.viewer }),
  component: AdminShell,
})

function AdminShell() {
  const { t } = useTranslation()
  const { viewer } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  return (
    <Shell
      locale={locale}
      viewer={viewer}
      destinations={ADMIN_DESTINATIONS}
      home="/$lang/admin"
      subtitle={t('admin.title')}
    >
      <Outlet />
    </Shell>
  )
}
