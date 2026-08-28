import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatDate, formatMoney, formatNumber } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { Route as AppRoute } from '~/routes/$lang/app'
import { loadBilling, loadPlanChangeRequest, refreshUsage } from '~/server/billing'
import { listPublicPlans } from '~/server/pricing'
import { PlanChangeCard } from '~/ui/billing/plan-change'
import type { UsageLine } from '~/server/reads/billing'
import { Button } from '~/ui/shadcn/button'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'
import { BillingSkeleton } from '~/ui/skeletons'

/**
 * ABONNEMENT — ce que l'agence paie, et ce qu'il lui reste.
 *
 * L'écran ne vend rien et ne prend aucun paiement : au Maroc, aucun prestataire
 * n'opère (docs/DECISIONS.md §3), le règlement se fait par virement et la plateforme
 * le constate. L'écran dit donc trois choses et s'arrête là : l'offre en cours, la
 * consommation par rapport aux limites, et les factures.
 *
 * La consommation est la seule information vraiment utile au quotidien : « 38 sur 40
 * véhicules » se lit d'un coup d'œil et prévient l'appel au support deux semaines plus
 * tard.
 */
export const Route = createFileRoute('/$lang/app/abonnement')({
  loader: async () => ({
    billing: await loadBilling(),
    // Les offres sont LUES EN BASE, jamais écrites dans la page : c'est la même règle
    // que sur la vitrine, et pour la même raison — un catalogue codé en dur finit par
    // contredire celui de la facture.
    plans: await listPublicPlans(),
    pendingRequest: await loadPlanChangeRequest(),
  }),
  pendingComponent: BillingSkeleton,
  component: BillingPage,
})

const STATUS_TONES: Record<string, BadgeVariant> = {
  trialing: 'accent',
  active: 'calm',
  past_due: 'warn',
  read_only: 'danger',
  cancelled: 'neutral',
}

const STATUS_KEYS: Record<string, string> = {
  trialing: 'billing.statusTrialing',
  active: 'billing.statusActive',
  past_due: 'billing.statusPastDue',
  read_only: 'billing.statusReadOnly',
  cancelled: 'billing.statusCancelled',
}

const INVOICE_KEYS: Record<string, string> = {
  draft: 'billing.invoiceDraft',
  sent: 'billing.invoiceSent',
  paid: 'billing.invoicePaid',
  overdue: 'billing.invoiceOverdue',
  void: 'billing.invoiceVoid',
}

const COUNTER_KEYS: Record<string, string> = {
  vehicles: 'billing.counterVehicles',
  users: 'billing.counterUsers',
  branches: 'billing.counterBranches',
}

function BillingPage() {
  const { t } = useTranslation()
  const { billing, plans, pendingRequest } = Route.useLoaderData()
  // Le rôle vient de la coquille : seul un `owner` engage l'agence financièrement.
  const { viewer } = AppRoute.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <div>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('billing.title')}</h1>
        <span className="text-xs text-muted-foreground">{t('billing.subtitle')}</span>
        <span className="ms-auto">
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void refreshUsage()
                .then(() => router.invalidate())
                .finally(() => setBusy(false))
            }}
          >
            {t('billing.refresh')}
          </Button>
        </span>
      </header>

      {/*
        L'avertissement d'impayé est un filet épaissi, pas une carte : c'est la seule
        chose de cet écran qui appelle une action, et elle doit se voir sans crier.
      */}
      {billing.status === 'read_only' ? (
        <p role="status" className="mt-6 border-y-2 border-destructive px-4 py-3 text-sm text-destructive">
          {t('billing.readOnlyNotice')}
        </p>
      ) : null}
      {billing.status === 'past_due' ? (
        <p role="status" className="mt-6 border-y-2 border-warning px-4 py-3 text-sm">
          {t('billing.pastDueNotice')}
        </p>
      ) : null}

      <dl className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        <Line label={t('billing.plan')}>
          <span className="font-medium">{billing.planCode}</span>
        </Line>
        <Line label={t('billing.status')}>
          <Badge variant={STATUS_TONES[billing.status] ?? 'neutral'}>
            {t(STATUS_KEYS[billing.status] ?? 'billing.statusActive')}
          </Badge>
        </Line>
        {billing.trialEndsOn ? (
          <Line label={t('billing.trialEnds')}>
            <span className="numeric">{formatDate(billing.trialEndsOn, locale)}</span>
          </Line>
        ) : null}
        {billing.periodEndsOn ? (
          <Line label={t('billing.periodEnds')}>
            <span className="numeric">{formatDate(billing.periodEndsOn, locale)}</span>
          </Line>
        ) : null}
        {billing.graceUntilOn ? (
          <Line label={t('billing.graceUntil')}>
            <span className="numeric">{formatDate(billing.graceUntilOn, locale)}</span>
          </Line>
        ) : null}
      </dl>

      {billing.cancelAtPeriodEnd ? (
        <p className="mt-4 text-xs text-muted-foreground">{t('billing.cancelAtPeriodEnd')}</p>
      ) : null}

      <div className="mt-10">
        <PlanChangeCard
          currentPlanCode={billing.planCode}
          plans={plans.map((plan) => plan.code)}
          pending={pendingRequest}
          canRequest={viewer.organization?.role === 'owner'}
          locale={locale}
        />
      </div>

      <section className="mt-10">
        <h2 className="border-b border-border pb-2 text-base">{t('billing.usageTitle')}</h2>
        <ul className="mt-2">
          {billing.usage.map((line) => (
            <UsageRow key={line.counter} line={line} locale={locale} />
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="border-b border-border pb-2 text-base">
          {t('billing.invoicesTitle')}
        </h2>
        {billing.invoices.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('billing.invoicesEmpty')}</p>
        ) : (
          <ul className="mt-2">
            {billing.invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2"
                style={{ minHeight: 'var(--row-height-dense)' }}
              >
                <span className="ledger-margin numeric w-24 sm:w-32 shrink-0 pe-4">{invoice.number}</span>
                {invoice.issuedOn ? (
                  <span className="numeric text-xs text-muted-foreground">
                    {formatDate(invoice.issuedOn, locale)}
                  </span>
                ) : null}
                <span className="numeric ms-auto">
                  {formatMoney(invoice.totalCents, locale, invoice.currency)}
                </span>
                <Badge variant={invoice.status === 'paid' ? 'calm' : 'neutral'}>
                  {t(INVOICE_KEYS[invoice.status] ?? 'billing.invoiceSent')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="ms-auto">{children}</dd>
    </div>
  )
}

/**
 * Une ligne de consommation.
 *
 * La limite atteinte porte un cachet, pas seulement une couleur : « 10 sur 10 » et un
 * mot. C'est la règle du produit — la couleur ne porte jamais l'information seule.
 */
function UsageRow({ line, locale }: { line: UsageLine; locale: Locale }) {
  const { t } = useTranslation()

  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2"
      style={{ minHeight: 'var(--row-height-dense)' }}
    >
      <span className="text-sm">{t(COUNTER_KEYS[line.counter] ?? 'billing.counterVehicles')}</span>
      <span className="numeric ms-auto text-sm">
        {line.limit === null
          ? `${formatNumber(line.current, locale)} · ${t('billing.unlimited')}`
          : t('billing.ofLimit', {
              current: formatNumber(line.current, locale),
              limit: formatNumber(line.limit, locale),
            })}
      </span>
      {line.room ? null : <Badge variant="warn">{t('billing.full')}</Badge>}
    </li>
  )
}
