import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PAYMENT_METHODS } from '~/core/schemas/rental'
import { formatDateTime, formatMoney } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import {
  cancelContract,
  getContract,
  recordPayment,
  returnContract,
  startContract,
} from '~/server/contracts'
import { Button, buttonVariants } from '~/ui/shadcn/button'
import { Field, FormError, Select } from '~/ui/forms/fields'
import { choiceField, textField } from '~/ui/forms/form-data'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'
import { VehicleFileSkeleton } from '~/ui/skeletons'

/**
 * Fiche contrat.
 *
 * Le contrat est un document : référence en tête, parties, période, montants, et les
 * actions du jour au bas. Chaque action correspond à un geste réel du comptoir —
 * remettre les clés, récupérer la voiture, encaisser.
 */
export const Route = createFileRoute('/$lang/app/contrats/$contractId')({
  loader: async ({ params }) => ({ file: await getContract({ data: { id: params.contractId } }) }),
  pendingComponent: VehicleFileSkeleton,
  component: ContractPage,
})

const STATUS_TONES: Record<string, BadgeVariant> = {
  reservation: 'neutral',
  active: 'accent',
  returned: 'calm',
  late: 'danger',
  cancelled: 'neutral',
}

function cents(form: FormData, name: string): number | undefined {
  const raw = textField(form, name).replace(',', '.')
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined
}

function ContractPage() {
  const { t } = useTranslation()
  const { file } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const contract = file.contract
  const remaining = contract.totalCents - file.paidCents

  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (cause) {
      setError(
        cause instanceof Error && /OdometerInconsistent|below start km/.test(cause.message)
          ? t('contract.odometerBackwards')
          : t('error.genericTitle'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border pb-3">
        <span className="numeric text-2xl">{contract.reference}</span>
        <Badge variant={STATUS_TONES[contract.status] ?? 'neutral'}>
          {t(`contract.statuses.${contract.status}`)}
        </Badge>
        <span className="ms-auto">
          <Link
            to="/$lang/app/contrats"
            params={{ lang: locale }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('contract.back')}</span>
          </Link>
        </span>
      </header>

      {/* --- Les parties et la période, comme sur un contrat papier. --- */}
      <dl className="mt-6 grid gap-px bg-border sm:grid-cols-2">
        <Row label={t('contract.customer')} value={file.customerLabel} />
        <Row label={t('contract.vehicle')} value={file.vehicleLabel} />
        <Row
          label={t('contract.start')}
          value={formatDateTime(contract.plannedStartAt, locale)}
          numeric
        />
        <Row
          label={t('contract.end')}
          value={formatDateTime(contract.plannedEndAt, locale)}
          numeric
        />
        {contract.actualStartAt ? (
          <Row
            label={t('contract.startedAt')}
            value={formatDateTime(contract.actualStartAt, locale)}
            numeric
          />
        ) : null}
        {contract.actualEndAt ? (
          <Row
            label={t('contract.returnedAt')}
            value={formatDateTime(contract.actualEndAt, locale)}
            numeric
          />
        ) : null}
      </dl>

      {/* --- Les montants, en chiffres tabulaires alignés. --- */}
      <dl className="mt-8 border-t border-border">
        <Money label={`${contract.daysBilled} ${t('contract.days')}`} value={contract.subtotalCents} locale={locale} />
        <Money label={t('contract.vat')} value={contract.vatCents} locale={locale} />
        <Money label={t('contract.total')} value={contract.totalCents} locale={locale} strong />
        <Money label={t('contract.paid')} value={file.paidCents} locale={locale} />
        {remaining > 0 ? (
          <Money label={t('contract.remaining')} value={remaining} locale={locale} warn />
        ) : null}
        {contract.depositCents > 0 ? (
          <Money label={t('contract.deposit')} value={contract.depositCents} locale={locale} />
        ) : null}
      </dl>

      {error ? (
        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>
      ) : null}

      {/* --- Les gestes du comptoir. --- */}
      {contract.status === 'reservation' ? (
        <form method="post"
          className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void act(() =>
              startContract({
                data: {
                  id: contract.id,
                  startKm: Number(textField(form, 'startKm')),
                  startFuelEighths: Number(textField(form, 'startFuelEighths')),
                },
              }),
            )
          }}
        >
          <Field name="startKm" label={t('contract.startKm')} type="number" required />
          <Field name="startFuelEighths" label={t('contract.fuel')} type="number" required defaultValue="8" />
          <div className="sm:col-span-2">
            <Button type="submit" variant="default" disabled={busy}>
              {busy ? t('auth.working') : t('contract.startAction')}
            </Button>
          </div>
        </form>
      ) : null}

      {contract.status === 'active' || contract.status === 'late' ? (
        <form method="post"
          className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void act(() =>
              returnContract({
                data: {
                  id: contract.id,
                  endKm: Number(textField(form, 'endKm')),
                  endFuelEighths: Number(textField(form, 'endFuelEighths')),
                  depositWithheldCents: cents(form, 'withheld'),
                  returnDeposit: form.get('returnDeposit') !== null,
                },
              }),
            )
          }}
        >
          <Field name="endKm" label={t('contract.endKm')} type="number" required />
          <Field name="endFuelEighths" label={t('contract.fuel')} type="number" required defaultValue="8" />
          <Field name="withheld" label={t('contract.withheld')} type="number" />
          <label className="flex items-center gap-2 text-sm" style={{ minHeight: 'var(--tap-target)' }}>
            <input type="checkbox" name="returnDeposit" defaultChecked />
            {t('contract.returnDeposit')}
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" variant="default" disabled={busy}>
              {busy ? t('auth.working') : t('contract.returnAction')}
            </Button>
          </div>
        </form>
      ) : null}

      {/* --- Encaissement, tant qu'il reste quelque chose à payer. --- */}
      {remaining > 0 && contract.status !== 'cancelled' ? (
        <form method="post"
          className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const amount = cents(form, 'amount')
            if (!amount) return
            const target = event.currentTarget
            void act(async () => {
              await recordPayment({
                data: {
                  contractId: contract.id,
                  amountCents: amount,
                  method: choiceField(form, 'method', PAYMENT_METHODS, 'cash'),
                },
              })
              target.reset()
            })
          }}
        >
          <Field name="amount" label={t('contract.amount')} type="number" required />
          <Select
            name="method"
            label={t('contract.method')}
            options={PAYMENT_METHODS}
            prefix="contract.paymentMethods"
          />
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              {t('contract.addPayment')}
            </Button>
          </div>
        </form>
      ) : null}

      {contract.status === 'reservation' || contract.status === 'active' ? (
        <form method="post"
          className="mt-8 flex flex-wrap items-end gap-4 border-t border-border pt-6"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void act(() =>
              cancelContract({
                data: { id: contract.id, reason: textField(form, 'reason') },
              }),
            )
          }}
        >
          <span className="min-w-60 flex-1">
            <Field name="reason" label={t('contract.cancelReason')} numeric={false} required />
          </span>
          <Button type="submit" variant="destructive" disabled={busy}>
            {t('contract.cancelAction')}
          </Button>
        </form>
      ) : null}
    </div>
  )
}

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-sm${numeric ? ' numeric' : ''}`}>{value}</dd>
    </div>
  )
}

function Money({
  label,
  value,
  locale,
  strong,
  warn,
}: {
  label: string
  value: number
  locale: 'fr' | 'ar' | 'en'
  strong?: boolean
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-2">
      <dt className={`text-sm${strong ? ' font-medium' : ' text-muted-foreground'}`}>{label}</dt>
      <dd
        className={`numeric text-sm${strong ? ' font-medium' : ''}${warn ? ' text-warning' : ''}`}
      >
        {formatMoney(value, locale)}
      </dd>
    </div>
  )
}
