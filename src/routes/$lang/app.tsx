import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { setImpersonationWrite, stopImpersonation } from '~/server/admin'
import { countCriticalAlerts } from '~/server/alerts'
import { fetchViewer, type ViewerState } from '~/server/session'
import { NotificationsProvider } from '~/ui/alerts/notifications-context'
import { useNotifications } from '~/ui/alerts/use-notifications'
import { Field } from '~/ui/forms/fields'
import { Button } from '~/ui/shadcn/button'
import { APP_DESTINATIONS } from '~/ui/nav/destinations'
import { Shell } from '~/ui/nav/shell'
import { Badge } from '~/ui/shadcn/badge'

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
   * Le sondage vit ICI, une seule fois pour l'application entière.
   *
   * Il alimente DEUX choses : la pastille rouge de la rubrique « Alertes » dans la
   * navigation, et la page des alertes elle-même, qui le reçoit par contexte. Le hook
   * est coupé tant qu'il n'y a pas d'organisation : il n'y aurait rien à sonder, et la
   * requête échouerait à chaque minute.
   */
  const notifications = useNotifications(viewer.organization !== null)
  const unread = notifications.feed?.unread ?? 0

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
      badges={{ '/$lang/app/alertes': unread }}
    >
      <NotificationsProvider state={notifications}>
        <Outlet />
      </NotificationsProvider>
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-destructive bg-destructive/10 px-4 py-3 sm:px-6">
      <Badge variant="danger">{t('alerts.criticalBanner', { count: critical })}</Badge>
      <Link
        to="/$lang/app/alertes"
        params={{ lang: locale }}
        className="ms-auto text-sm text-destructive underline underline-offset-4"
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
 *
 * **Il porte désormais l'élévation** (27/08/2026). `startImpersonation` posait
 * `writeEnabled: false` en annonçant depuis l'origine que « l'élévation est un second
 * geste, explicite » — et ce geste n'existait nulle part. Un administrateur entré chez
 * un client pour corriger une ligne ne pouvait que la regarder, puis demander au
 * client de la corriger lui-même. La politique était bonne, il manquait la porte.
 *
 * Le motif est OBLIGATOIRE pour élever, libre pour redescendre. Ce n'est pas une
 * formalité : c'est la seule chose qui répondra un jour à « pourquoi cette ligne
 * a-t-elle changé le 14 ». Le serveur le refuse aussi, l'écran ne fait que le dire
 * plus tôt.
 */
function ImpersonationBanner({ viewer }: { viewer: ViewerState }) {
  const { t } = useTranslation()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (!viewer.impersonation || !viewer.organization) return null
  const canWrite = viewer.impersonation.canWrite

  async function apply(enabled: boolean, reason?: string) {
    setBusy(true)
    setFailed(false)
    try {
      await setImpersonationWrite({
        data: { enabled, ...(reason === undefined ? {} : { reason }) },
      })
      // Rechargement complet : `canWrite` est calculé côté serveur à chaque requête,
      // et il commande l'affichage de TOUS les écrans en dessous. Rafraîchir la seule
      // bannière laisserait des boutons d'action grisés sur une session qui écrit.
      window.location.reload()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      className="border-b-2 border-destructive bg-destructive/10 px-4 py-3 sm:px-6"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Badge variant="danger">
          {t('app.impersonationBanner', { org: viewer.organization.name })}
        </Badge>

        {/* L'état d'écriture se dit dans les DEUX sens. « Écriture activée » est au
            moins aussi important à voir que « écriture désactivée ». */}
        <span className="text-xs text-destructive">
          {canWrite ? t('app.impersonationWriteOn') : t('app.impersonationReadOnly')}
        </span>

        <span className="ms-auto flex flex-wrap items-center gap-2">
          {canWrite ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                void apply(false)
              }}
            >
              {t('app.impersonationDisableWrite')}
            </Button>
          ) : asking ? null : (
            <Button variant="outline" disabled={busy} onClick={() => setAsking(true)}>
              {t('app.impersonationEnableWrite')}
            </Button>
          )}

          <Button
            variant="destructive"
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

      {/* Le motif, demandé sur place plutôt que dans une boîte du navigateur : un
          `prompt()` ne se traduit pas, ne se style pas, et ne dit pas où part ce
          qu'on y écrit. */}
      {asking && !canWrite ? (
        <form
          method="post"
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const reason = new FormData(event.currentTarget).get('reason')
            void apply(true, typeof reason === 'string' ? reason.trim() : '')
          }}
        >
          <Field
            name="reason"
            label={t('app.impersonationReasonLabel')}
            hint={t('app.impersonationReasonHint')}
            numeric={false}
            required
            maxLength={200}
            className="min-w-64 flex-1"
          />
          <div className="flex items-center gap-2 pb-6">
            <Button type="submit" disabled={busy}>
              {busy ? t('auth.working') : t('app.impersonationConfirmWrite')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
              {t('app.impersonationCancel')}
            </Button>
          </div>
        </form>
      ) : null}

      {failed ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {t('app.impersonationWriteFailed')}
        </p>
      ) : null}
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
    <div role="status" className="border-b border-border bg-muted px-4 py-3 sm:px-6">
      <Badge variant="accent">{t('app.demo')}</Badge>
      <p className="mt-2 text-sm">{t('demo.banner')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('demo.bannerDetail')}</p>
    </div>
  )
}

/** Abonnement gelé : on lit, on n'écrit plus, et rien n'est supprimé. */
function ReadOnlyBanner({ viewer }: { viewer: ViewerState }) {
  const { t } = useTranslation()
  const org = viewer.organization
  if (!org || org.canWrite || viewer.impersonation) return null

  return (
    <div role="status" className="border-b border-warning bg-warning/10 px-4 py-3 sm:px-6">
      <Badge variant="warn">{t('app.readOnly')}</Badge>
    </div>
  )
}
