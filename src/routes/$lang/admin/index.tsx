import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatDate, formatMoney, formatNumber } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { fetchPlatformMetrics } from '~/server/admin'
import type { PlanBreakdown, PlatformMetrics } from '~/db/repositories/platform'
import { buttonVariants } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { AdminDashboardSkeleton } from '~/ui/skeletons'
import { Card, CardBody, CardHeader, PageHeader, StatGroup } from '~/ui/primitives/card'
import { Badge } from '~/ui/shadcn/badge'

/**
 * TABLEAU DE BORD DE PLATEFORME.
 *
 * Le back-office n'avait qu'un écran — l'annuaire des agences — et il fallait le lire
 * ligne à ligne pour savoir comment allait le produit. Cet écran répond aux quatre
 * questions qu'on se pose vraiment en l'ouvrant le matin :
 *
 *  1. combien d'agences, et combien viennent d'arriver ;
 *  2. combien rapportent, et combien sont en retard de paiement ;
 *  3. ce que la plateforme porte réellement — voitures, locations en cours ;
 *  4. qui vient de s'inscrire, et si son espace est vide.
 *
 * Ce qu'il ne fait PAS : montrer une donnée métier d'une agence. Pas un contrat, pas
 * un client, pas une plaque. Le back-office lit des compteurs ; pour voir les données
 * d'un client, il faut passer par l'impersonation, qui est tracée et expire en trente
 * minutes.
 */
export const Route = createFileRoute('/$lang/admin/')({
  loader: async () => ({ metrics: await fetchPlatformMetrics() }),
  pendingComponent: AdminDashboardSkeleton,
  component: AdminDashboardPage,
})

function AdminDashboardPage() {
  const { t } = useTranslation()
  const { metrics } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  if (metrics.organizations.total === 0) {
    return (
      <div>
        <PageHeader title={t('admin.overview')} description={t('admin.overviewBody')} />
        <Card>
          <CardBody>
            <EmptyState
              title={t('admin.noOrganizations')}
              body={t('admin.noOrganizationsBody')}
              action={
                <Link
                  to="/$lang/admin/organisations"
                  params={{ lang: locale }}
                  className={buttonVariants()}
                >
                  {t('admin.newOrganization')}
                </Link>
              }
            />
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={t('admin.overview')}
        description={t('admin.overviewBody')}
        action={
          <Link
            to="/$lang/admin/organisations"
            params={{ lang: locale }}
            className={buttonVariants()}
          >
            {t('admin.newOrganization')}
          </Link>
        }
      />

      <Tiles metrics={metrics} locale={locale} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <RecentOrganizations metrics={metrics} locale={locale} />
        <div className="grid gap-6 self-start">
          <PlanMix plans={metrics.plans} locale={locale} />
          <Revenue metrics={metrics} locale={locale} />
        </div>
      </div>
    </div>
  )
}

/**
 * La barre de mesures.
 *
 * Cinq chiffres dans UNE carte, séparés par des filets — pas cinq cartes détachées.
 * Une rangée de vignettes se survole ; une barre continue se lit d'un coup d'œil,
 * ce qui est exactement ce qu'on demande à la première ligne d'un tableau de bord.
 *
 * Seuls « en difficulté » et « prospects » ont le droit de se colorer, et seulement
 * quand ils ne valent pas zéro : une mesure rouge affichant « 0 » depuis trois mois
 * apprend à ne plus voir le rouge.
 */
function Tiles({ metrics, locale }: { metrics: PlatformMetrics; locale: Locale }) {
  const { t } = useTranslation()
  const { organizations, fleet, rentals } = metrics

  return (
    <StatGroup
      items={[
        {
          key: 'organizations',
          label: t('admin.tileOrganizations'),
          value: formatNumber(organizations.total, locale),
          hint: t('admin.tileOrganizationsHint', {
            active: formatNumber(organizations.active, locale),
            trialing: formatNumber(organizations.trialing, locale),
          }),
        },
        {
          key: 'mrr',
          label: t('admin.tileMrr'),
          value: formatMoney(metrics.mrrCents, locale, 'MAD', { withDecimals: false }),
          hint: t('admin.tileMrrHint', { created: organizations.createdLast30Days }),
        },
        {
          key: 'vehicles',
          label: t('admin.tileVehicles'),
          value: formatNumber(fleet.vehicles, locale),
          hint: t('admin.tileVehiclesHint', { rented: fleet.rented }),
        },
        {
          key: 'atRisk',
          label: t('admin.tileAtRisk'),
          tone: organizations.atRisk > 0 ? ('danger' as const) : ('neutral' as const),
          value: formatNumber(organizations.atRisk, locale),
          hint: t('admin.tileAtRiskHint', { rentals: rentals.active }),
        },
        {
          key: 'leads',
          label: t('admin.tileLeads'),
          tone: metrics.newLeads > 0 ? ('accent' as const) : ('neutral' as const),
          value: formatNumber(metrics.newLeads, locale),
          hint: t('admin.tileLeadsHint'),
        },
      ]}
    />
  )
}

/** Les six dernières agences. Une agence sans voiture est une agence qui n'a pas démarré. */
function RecentOrganizations({
  metrics,
  locale,
}: {
  metrics: PlatformMetrics
  locale: Locale
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader
        title={t('admin.recentOrganizations')}
        action={
          <Link
            to="/$lang/admin/organisations"
            params={{ lang: locale }}
            className="text-xs text-stamp underline underline-offset-4"
          >
            {t('admin.seeAll')}
          </Link>
        }
      />
      <ul>
        {metrics.recent.map((org) => (
          <li
            key={org.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule px-4 py-3 last:border-b-0 sm:px-5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{org.name}</p>
              <p className="numeric truncate text-xs text-muted">
                {org.slug} · {formatDate(org.createdAt, locale)}
              </p>
            </div>
            {org.isDemo ? <Badge variant="accent">{t('app.demo')}</Badge> : null}
            <Badge>{org.planCode}</Badge>
            {/*
              Zéro voiture n'est pas une statistique, c'est un signal : l'agence a été
              créée et n'a jamais été remplie. C'est le seul appel à l'action de la
              page, et il ne s'affiche que quand il a un sens.
            */}
            <span
              className={`numeric text-xs ${org.vehicles === 0 ? 'text-warn' : 'text-muted'}`}
            >
              {org.vehicles === 0
                ? t('admin.notStarted')
                : t('admin.vehicleCount', { count: org.vehicles })}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * Répartition par offre.
 *
 * Une barre par offre, dessinée au filet et à la largeur : aucune bibliothèque de
 * graphiques n'entre dans le paquet pour quatre lignes. La valeur est écrite à côté
 * de la barre — une barre sans chiffre se lit à vue de nez, et se lit faux.
 */
function PlanMix({ plans, locale }: { plans: readonly PlanBreakdown[]; locale: Locale }) {
  const { t } = useTranslation()
  const highest = plans.reduce((max, plan) => Math.max(max, plan.organizations), 0)

  return (
    <Card>
      <CardHeader title={t('admin.planMix')} />
      <CardBody>
        {plans.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.noBillableOrganizations')}</p>
        ) : (
          <ul className="space-y-3">
            {plans.map((plan) => (
              <li key={plan.planCode}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{t(`plan.${plan.planCode}`)}</span>
                  <span className="numeric ms-auto text-sm">
                    {formatNumber(plan.organizations, locale)}
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-sm bg-surface-sunken"
                  role="presentation"
                >
                  <div
                    className="h-full bg-stamp"
                    style={{
                      inlineSize: `${highest === 0 ? 0 : Math.round((plan.organizations / highest) * 100)}%`,
                    }}
                  />
                </div>
                <p className="numeric mt-1 text-2xs text-muted">
                  {formatMoney(plan.monthlyCents, locale, 'MAD', { withDecimals: false })}
                  {' · '}
                  {t('billing.perMonth')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

/**
 * Facturation des trente derniers jours, PAR DEVISE.
 *
 * Additionner des dirhams et des euros donnerait un nombre qui ne veut rien dire, et
 * personne ne s'en apercevrait tant qu'un seul client facture en euros (règle 4 de la
 * charte de portabilité).
 */
function Revenue({ metrics, locale }: { metrics: PlatformMetrics; locale: Locale }) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader title={t('admin.revenue')} hint={t('admin.last30Days')} />
      <CardBody>
        {metrics.revenueLast30Days.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.noInvoices')}</p>
        ) : (
          <dl className="space-y-3">
            {metrics.revenueLast30Days.map((line) => (
              <div key={line.currency}>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-muted">{t('admin.collected')}</dt>
                  <dd className="numeric text-sm text-calm">
                    {formatMoney(line.paidCents, locale, line.currency)}
                  </dd>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-muted">{t('admin.outstanding')}</dt>
                  <dd
                    className={`numeric text-sm ${line.outstandingCents > 0 ? 'text-warn' : ''}`}
                  >
                    {formatMoney(line.outstandingCents, locale, line.currency)}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        )}
      </CardBody>
    </Card>
  )
}
