import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { stopImpersonation } from '~/server/admin'
import { countCriticalAlerts } from '~/server/alerts'
import { fetchViewer, type ViewerState } from '~/server/session'
import { APP_DESTINATIONS } from '~/ui/nav/destinations'
import { Shell } from '~/ui/nav/shell'
import { Button } from '~/ui/primitives/button'
import { Stamp } from '~/ui/primitives/stamp'

/**
 * Coquille de l'espace de travail client.
 *
 * Le garde est dans `beforeLoad`, donc côté serveur au premier rendu : une page
 * protégée ne doit jamais être envoyée puis retirée après coup.
 */
export const Route = createFileRoute('/$lang/app')({
  beforeLoad: async ({ params }) => {
    const viewer = await fetchViewer()
    const lang = isLocale(params.lang) ? params.lang : DEFAULT_LOCALE
    if (!viewer) throw redirect({ to: '/$lang/connexion', params: { lang } })
    return { viewer }
  },
  loader: async ({ context }) => ({
    viewer: context.viewer,
    // Le compteur d'échéances critiques est chargé avec la coquille : c'est la seule
    // information qui justifie d'ouvrir l'application, elle ne doit pas arriver après.
    alerts: context.viewer.organization ? await countCriticalAlerts() : { critical: 0, total: 0 },
  }),
  component: AppShell,
})

function AppShell() {
  const { viewer, alerts } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  /*
   * Sans organisation, pas de navigation : l'écran n'a qu'une action, se déconnecter.
   * Afficher huit rubriques qui mènent toutes à un vide serait pire que rien.
   */
  if (!viewer.organization) {
    return (
      <main id="content" className="mx-auto w-full max-w-[1180px] px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    )
  }

  return (
    <Shell
      locale={locale}
      viewer={viewer}
      destinations={APP_DESTINATIONS}
      home="/$lang/app"
      subtitle={viewer.organization.name}
      banners={
        <>
          <ImpersonationBanner viewer={viewer} />
          <ReadOnlyBanner viewer={viewer} />
          <DemoBanner viewer={viewer} />
          <CriticalBanner locale={locale} critical={alerts.critical} />
        </>
      }
    >
      <Outlet />
    </Shell>
  )
}

/**
 * Bandeau des échéances critiques.
 *
 * Un filet épaissi, pas une carte : c'est la première chose qu'on doit voir en
 * ouvrant l'application, et la seule qui a le droit d'interrompre. Quand il n'y a
 * rien de critique, il disparaît complètement — un bandeau permanent finit par ne
 * plus être lu.
 */
function CriticalBanner({ locale, critical }: { locale: Locale; critical: number }) {
  const { t } = useTranslation()
  if (critical === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-danger bg-danger-wash px-4 py-3 sm:px-6">
      <Stamp tone="danger">{t('alerts.criticalBanner', { count: critical })}</Stamp>
      <Link
        to="/$lang/app/alertes"
        params={{ lang: locale }}
        className="ms-auto text-sm text-danger underline underline-offset-4"
      >
        {t('alerts.seeAll')}
      </Link>
    </div>
  )
}

/**
 * LE bandeau d'impersonation.
 *
 * Permanent, très visible, impossible à replier : c'est la contrepartie de la
 * fonctionnalité la plus dangereuse du produit. Il dit aussi, explicitement, que
 * l'écriture est désactivée — parce qu'un administrateur qui l'oublie est un
 * administrateur qui va écrire chez un client sans s'en rendre compte.
 */
function ImpersonationBanner({ viewer }: { viewer: ViewerState }) {
  const { t } = useTranslation()
  if (!viewer.impersonation || !viewer.organization) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-danger bg-danger-wash px-4 py-3 sm:px-6"
    >
      <Stamp tone="danger">{t('app.impersonationBanner', { org: viewer.organization.name })}</Stamp>
      {!viewer.impersonation.canWrite ? (
        <span className="text-xs text-danger">{t('app.impersonationReadOnly')}</span>
      ) : null}
      <span className="ms-auto">
        <Button
          variant="danger"
          onClick={() => {
            void stopImpersonation().then(() => {
              // Rechargement complet : les cookies de session viennent de changer.
              window.location.assign('/')
            })
          }}
        >
          {t('app.stopImpersonating')}
        </Button>
      </span>
    </div>
  )
}

/**
 * Espace de démonstration.
 *
 * Le cahier des charges l'exige explicitement (docs/DECISIONS.md É10) : deux espaces
 * PARTAGÉS, donc un bandeau qui le dit. Deux visiteurs simultanés se voient
 * mutuellement — c'est le compromis assumé du choix « partagé plutôt qu'une copie par
 * visiteur », et le taire transformerait ce compromis en bug apparent.
 *
 * La seconde phrase compte autant que la première : elle AUTORISE. Un visiteur qui
 * n'ose pas toucher aux données ne voit pas le produit ; on lui dit que rien ne sort
 * et que tout revient demain.
 */
function DemoBanner({ viewer }: { viewer: ViewerState }) {
  const { t } = useTranslation()
  if (!viewer.organization?.isDemo) return null

  return (
    <div role="status" className="border-b border-rule bg-surface-sunken px-4 py-3 sm:px-6">
      <Stamp tone="accent">{t('app.demo')}</Stamp>
      <p className="mt-2 text-sm">{t('demo.banner')}</p>
      <p className="mt-1 text-xs text-muted">{t('demo.bannerDetail')}</p>
    </div>
  )
}

/** Abonnement gelé : on lit, on n'écrit plus, et rien n'est supprimé. */
function ReadOnlyBanner({ viewer }: { viewer: ViewerState }) {
  const { t } = useTranslation()
  const org = viewer.organization
  if (!org || org.canWrite || viewer.impersonation) return null

  return (
    <div role="status" className="border-b border-warn bg-warn-wash px-4 py-3 sm:px-6">
      <Stamp tone="warn">{t('app.readOnly')}</Stamp>
    </div>
  )
}
