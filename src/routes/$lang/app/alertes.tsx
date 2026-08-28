import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { RefreshCw, Volume2, VolumeX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { formatDate } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import {
  acknowledgeAlert,
  listAlerts,
  rescanAlerts,
  snoozeAlert,
  type NotificationItem,
} from '~/server/alerts'
import { useNotificationsState } from '~/ui/alerts/notifications-context'
import { Button } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { Card, PageHeader } from '~/ui/primitives/card'
import { AlertListSkeleton } from '~/ui/skeletons'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'

/**
 * CENTRE DE NOTIFICATIONS — et il n'y en a qu'un.
 *
 * Il y a eu, entre le 27/08/2026 et le même jour, une cloche séparée dans l'en-tête.
 * C'était une seconde porte vers cette page : deux entrées pour un même sujet
 * obligent à choisir laquelle regarder, et la moitié des gestes se font alors au
 * mauvais endroit. La cloche est retirée ; il reste la PASTILLE sur la rubrique
 * « Alertes », qui compte, et cette page, qui traite.
 *
 * Trois verbes distincts cohabitent ici, et c'est tout l'écran :
 *
 *  - **LU** — personnel, réversible, sans effet métier. Fait descendre la pastille.
 *  - **REPORTÉ** — l'échéance revient dans sept jours. Elle reste dans la liste,
 *    rangée derrière.
 *  - **TRAITÉ** — quelqu'un déclare avoir fait le nécessaire. Acte d'agence, visible
 *    de tous, et le moteur rouvrira quand même si la cause n'a pas bougé : dire
 *    qu'on a payé ne paie pas la vignette.
 *
 * La sévérité se lit à la forme autant qu'à la couleur : filet épaissi en tête de
 * ligne, cachet nommé, échéance en chiffres tabulaires. Un daltonien lit la même
 * urgence que les autres.
 */
export const Route = createFileRoute('/$lang/app/alertes')({
  loader: async () => ({ alerts: await listAlerts() }),
  pendingComponent: AlertListSkeleton,
  component: AlertsPage,
})

const SEVERITY_TONES: Record<string, BadgeVariant> = {
  blocking: 'danger',
  critical: 'danger',
  high: 'warn',
  medium: 'neutral',
  low: 'neutral',
}

const SEVERITY_BORDER: Record<string, string> = {
  blocking: 'border-s-destructive',
  critical: 'border-s-destructive',
  high: 'border-s-warning',
  medium: 'border-s-input',
  low: 'border-s-border',
}

function AlertsPage() {
  const { t } = useTranslation()
  const { alerts } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()
  const notifications = useNotificationsState()
  const [busy, setBusy] = useState(false)

  const unread = alerts.filter((alert) => !alert.read)

  /*
   * Le sondage tourne toutes les minutes et peut trouver du neuf pendant qu'on est
   * sur cette page. On ne remplace PAS la liste sous le curseur — quelqu'un en train
   * de reporter une échéance verrait ses lignes bouger. On propose de l'actualiser,
   * et c'est lui qui décide du moment.
   */
  const polled = notifications?.feed?.unread ?? 0
  const hasNews = polled > unread.length

  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      await router.invalidate()
      // La pastille de navigation descend TOUT DE SUITE, sans attendre le sondage.
      notifications?.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('alerts.title')}
        description={t('alerts.centreBody')}
        meta={
          <>
            <Badge variant={unread.length > 0 ? 'danger' : 'neutral'}>
              {t('alerts.bell.unread', { count: unread.length })}
            </Badge>
            <Badge variant="neutral">{t('alerts.activeCount', { count: alerts.length })}</Badge>
          </>
        }
        action={
          <>
            {notifications ? (
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={notifications.soundOn}
                aria-label={
                  notifications.soundOn ? t('alerts.bell.soundOn') : t('alerts.bell.soundOff')
                }
                onClick={notifications.toggleSound}
              >
                {notifications.soundOn ? (
                  <Volume2 aria-hidden="true" />
                ) : (
                  <VolumeX aria-hidden="true" />
                )}
              </Button>
            ) : null}

            <Button
              variant="outline"
              disabled={busy || unread.length === 0}
              onClick={() => void act(() => notifications?.markRead() ?? Promise.resolve())}
            >
              {t('alerts.bell.markAll')}
            </Button>

            <Button
              disabled={busy}
              onClick={() => void act(() => rescanAlerts())}
            >
              <RefreshCw aria-hidden="true" />
              <span>{busy ? t('auth.working') : t('alerts.rescan')}</span>
            </Button>
          </>
        }
      />

      {hasNews ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-ring bg-accent/40 px-4 py-3"
        >
          <span className="text-sm">{t('alerts.newSince', { count: polled - unread.length })}</span>
          <Button
            size="sm"
            variant="outline"
            className="ms-auto"
            onClick={() => void router.invalidate()}
          >
            {t('alerts.refreshList')}
          </Button>
        </div>
      ) : null}

      {alerts.length === 0 ? (
        <EmptyState title={t('alerts.none')} body={t('alerts.noneBody')} />
      ) : (
        <Card as="div">
          <ul>
            {alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                locale={locale}
                busy={busy}
                onAct={act}
                onRead={() => notifications?.markRead([alert.id]) ?? Promise.resolve()}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

function AlertRow({
  alert,
  locale,
  busy,
  onAct,
  onRead,
}: {
  alert: NotificationItem
  locale: Locale
  busy: boolean
  onAct: (action: () => Promise<unknown>) => Promise<void>
  onRead: () => Promise<void>
}) {
  const { t } = useTranslation()

  const subject =
    typeof alert.payload['vehicle'] === 'string'
      ? alert.payload['vehicle']
      : typeof alert.payload['reference'] === 'string'
        ? alert.payload['reference']
        : typeof alert.payload['customer'] === 'string'
          ? alert.payload['customer']
          : ''

  return (
    <li
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border border-s-2 px-4 py-3 last:border-b-0 ${
        SEVERITY_BORDER[alert.severity] ?? 'border-s-border'
      } ${alert.read ? '' : 'bg-accent/30'}`}
    >
      {/* Le non-lu se marque par un point ET par un fond : la graisse seule ne se voit
          pas sur une liste parcourue en diagonale. */}
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${alert.read ? 'bg-transparent' : 'bg-destructive'}`}
      />

      <Badge variant={SEVERITY_TONES[alert.severity] ?? 'neutral'}>
        {t(`alerts.severity.${alert.severity}`)}
      </Badge>

      <span className="font-medium">{t(`alerts.type.${alert.alertType}`)}</span>
      {subject ? <span className="text-sm text-muted-foreground">{subject}</span> : null}

      {alert.dueOn ? (
        <span className="numeric text-xs text-muted-foreground">
          {formatDate(alert.dueOn, locale)}
        </span>
      ) : null}

      {alert.state === 'acknowledged' ? (
        <Badge variant="calm">{t('alerts.acknowledged')}</Badge>
      ) : null}
      {alert.state === 'snoozed' && alert.snoozedUntilAt ? (
        <span className="numeric text-xs text-muted-foreground">
          {t('alerts.snoozedUntil')} {formatDate(alert.snoozedUntilAt.slice(0, 10), locale)}
        </span>
      ) : null}

      <span className="ms-auto flex flex-wrap items-center gap-2">
        {alert.entityType === 'vehicle' ? (
          <Link
            to="/$lang/app/vehicules/$vehicleId"
            params={{ lang: locale, vehicleId: alert.entityId }}
            className="px-2 text-xs text-primary underline underline-offset-4"
          >
            {t('alerts.open')}
          </Link>
        ) : null}

        {alert.read ? null : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void onAct(onRead)}
          >
            {t('alerts.bell.markRead')}
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void onAct(() => snoozeAlert({ data: { id: alert.id, days: 7 } }))}
        >
          {t('alerts.snoozeDays', { count: 7 })}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || alert.state === 'acknowledged'}
          onClick={() => void onAct(() => acknowledgeAlert({ data: { id: alert.id } }))}
        >
          {t('alerts.acknowledge')}
        </Button>
      </span>
    </li>
  )
}
