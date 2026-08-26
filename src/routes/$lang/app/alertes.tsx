import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatDate } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import {
  acknowledgeAlert,
  listAlerts,
  rescanAlerts,
  snoozeAlert,
  type AlertView,
} from '~/server/alerts'
import { EmptyState } from '~/ui/feedback/states'
import { AlertListSkeleton } from '~/ui/skeletons'
import { Button } from '~/ui/primitives/button'
import { Stamp, type StampTone } from '~/ui/primitives/stamp'

/**
 * Centre de notifications.
 *
 * Une ligne de registre par échéance, la plus grave en haut. La sévérité se lit à la
 * forme autant qu'à la couleur : filet épaissi en tête de ligne, cachet, et l'échéance
 * en chiffres tabulaires. Un daltonien lit l'urgence sans la couleur.
 */
export const Route = createFileRoute('/$lang/app/alertes')({
  loader: async () => ({ alerts: await listAlerts() }),
  pendingComponent: AlertListSkeleton,
  component: AlertsPage,
})

const SEVERITY_TONES: Record<string, StampTone> = {
  blocking: 'danger',
  critical: 'danger',
  high: 'warn',
  medium: 'neutral',
  low: 'neutral',
}

const SEVERITY_BORDER: Record<string, string> = {
  blocking: 'border-danger',
  critical: 'border-danger',
  high: 'border-warn',
  medium: 'border-rule-strong',
  low: 'border-rule',
}

function AlertsPage() {
  const { t } = useTranslation()
  const { alerts } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function rescan() {
    setBusy(true)
    try {
      await rescanAlerts()
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-rule-strong pb-3">
        <h1 className="font-display text-2xl">{t('alerts.title')}</h1>
        <span className="numeric text-xs text-muted">{alerts.length}</span>
        <span className="ms-auto">
          <Button onClick={() => void rescan()} disabled={busy}>
            {busy ? t('auth.working') : t('alerts.rescan')}
          </Button>
        </span>
      </header>

      {alerts.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t('alerts.none')} body={t('alerts.noneBody')} />
        </div>
      ) : (
        <ul className="mt-6 border-t border-rule">
          {alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  )
}

function AlertRow({ alert, locale }: { alert: AlertView; locale: Locale }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

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
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule border-s-2 px-4 py-3 ${
        SEVERITY_BORDER[alert.severity] ?? 'border-s-rule'
      }`}
    >
      <Stamp tone={SEVERITY_TONES[alert.severity] ?? 'neutral'}>
        {t(`alerts.severity.${alert.severity}`)}
      </Stamp>

      <span className="font-medium">{t(`alerts.type.${alert.alertType}`)}</span>
      {subject ? <span className="text-sm text-muted">{subject}</span> : null}

      {alert.dueOn ? (
        <span className="numeric text-xs text-muted">{formatDate(alert.dueOn, locale)}</span>
      ) : null}

      {alert.state === 'acknowledged' ? <Stamp tone="calm">{t('alerts.acknowledged')}</Stamp> : null}
      {alert.state === 'snoozed' && alert.snoozedUntilAt ? (
        <span className="numeric text-xs text-muted">
          {t('alerts.snoozedUntil')} {formatDate(alert.snoozedUntilAt.slice(0, 10), locale)}
        </span>
      ) : null}

      <span className="ms-auto flex flex-wrap items-center gap-2">
        {alert.entityType === 'vehicle' ? (
          <Link
            to="/$lang/app/vehicules/$vehicleId"
            params={{ lang: locale, vehicleId: alert.entityId }}
            className="px-2 text-xs text-stamp underline underline-offset-4"
          >
            {t('alerts.open')}
          </Link>
        ) : null}

        <Button
          onClick={() => void act(() => snoozeAlert({ data: { id: alert.id, days: 7 } }))}
          disabled={busy}
        >
          {t('alerts.snoozeDays', { count: 7 })}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void act(() => acknowledgeAlert({ data: { id: alert.id } }))}
          disabled={busy || alert.state === 'acknowledged'}
        >
          {t('alerts.acknowledge')}
        </Button>
      </span>
    </li>
  )
}
