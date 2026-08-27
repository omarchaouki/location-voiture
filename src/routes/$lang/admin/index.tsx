import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { PlanBreakdown, PlatformMetrics } from '~/db/repositories/platform'
import { formatDate, formatMoney, formatNumber } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { fetchPlatformMetrics } from '~/server/admin'
import { EmptyState } from '~/ui/feedback/states'
import { AdminDashboardSkeleton } from '~/ui/skeletons'
import { Badge } from '~/ui/shadcn/badge'
import { Button } from '~/ui/shadcn/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/ui/shadcn/card'

/**
 * TABLEAU DE BORD DE PLATEFORME.
 *
 * Il répond aux quatre questions qu'on se pose vraiment en l'ouvrant le matin :
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
 *
 * **Redessiné le 27/08/2026.** Les cinq mesures étaient serrées dans une seule carte
 * découpée par des filets calculés à l'index (`index % 4 === 0 ? …`). Le montage
 * tenait, mais il produisait des rangées bancales dès que la largeur changeait : à
 * deux colonnes, la cinquième mesure occupait seule toute une rangée. Cinq cartes
 * dans une grille se réarrangent d'elles-mêmes, et chacune peut porter sa sévérité
 * sans qu'on recalcule ses voisines.
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
      <div className="grid gap-6">
        <Header locale={locale} />
        <Card>
          <CardContent>
            <EmptyState
              title={t('admin.noOrganizations')}
              body={t('admin.noOrganizationsBody')}
              action={
                <Button asChild>
                  <Link to="/$lang/admin/organisations" params={{ lang: locale }}>
                    {t('admin.newOrganization')}
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <Header locale={locale} />
      <Tiles metrics={metrics} locale={locale} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <RecentOrganizations metrics={metrics} locale={locale} />
        <div className="grid min-w-0 gap-6 self-start">
          <PlanMix plans={metrics.plans} locale={locale} />
          <Revenue metrics={metrics} locale={locale} />
        </div>
      </div>
    </div>
  )
}

function Header({ locale }: { locale: Locale }) {
  const { t } = useTranslation()

  return (
    <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-semibold tracking-tight">{t('admin.overview')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('admin.overviewBody')}</p>
      </div>
      <Button asChild>
        <Link to="/$lang/admin/organisations" params={{ lang: locale }}>
          <Plus aria-hidden="true" />
          {t('admin.newOrganization')}
        </Link>
      </Button>
    </header>
  )
}

/** Sévérité d'une mesure. `null` = neutre, et c'est le cas le plus fréquent. */
type TileTone = 'danger' | 'accent' | null

/**
 * La rangée de mesures.
 *
 * Seuls « en difficulté » et « prospects » ont le droit de se colorer, et seulement
 * quand ils ne valent pas zéro : une mesure rouge affichant « 0 » depuis trois mois
 * apprend à ne plus voir le rouge.
 */
function Tiles({ metrics, locale }: { metrics: PlatformMetrics; locale: Locale }) {
  const { t } = useTranslation()
  const { organizations, fleet, rentals } = metrics

  const tiles: ReadonlyArray<{
    key: string
    label: string
    value: string
    hint: string
    tone: TileTone
  }> = [
    {
      key: 'organizations',
      label: t('admin.tileOrganizations'),
      value: formatNumber(organizations.total, locale),
      hint: t('admin.tileOrganizationsHint', {
        active: formatNumber(organizations.active, locale),
        trialing: formatNumber(organizations.trialing, locale),
      }),
      tone: null,
    },
    {
      key: 'mrr',
      label: t('admin.tileMrr'),
      value: formatMoney(metrics.mrrCents, locale, 'MAD', { withDecimals: false }),
      hint: t('admin.tileMrrHint', { created: organizations.createdLast30Days }),
      tone: null,
    },
    {
      key: 'vehicles',
      label: t('admin.tileVehicles'),
      value: formatNumber(fleet.vehicles, locale),
      hint: t('admin.tileVehiclesHint', { rented: fleet.rented }),
      tone: null,
    },
    {
      key: 'atRisk',
      label: t('admin.tileAtRisk'),
      value: formatNumber(organizations.atRisk, locale),
      hint: t('admin.tileAtRiskHint', { rentals: rentals.active }),
      tone: organizations.atRisk > 0 ? 'danger' : null,
    },
    {
      key: 'leads',
      label: t('admin.tileLeads'),
      value: formatNumber(metrics.newLeads, locale),
      hint: t('admin.tileLeadsHint'),
      tone: metrics.newLeads > 0 ? 'accent' : null,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {tiles.map((tile) => (
        <Card key={tile.key} className="min-w-0 gap-2 py-4">
          <CardContent>
            <p className="text-xs text-muted-foreground">{tile.label}</p>
            {/*
              Le chiffre porte `.numeric` : les mesures s'alignent au chiffre près, et
              le total ne saute pas quand il passe de 9 à 10.
            */}
            <p
              className={`numeric mt-1 text-xl font-semibold ${
                tile.tone === 'danger' ? 'text-destructive' : tile.tone === 'accent' ? 'text-primary' : ''
              }`}
            >
              {tile.value}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{tile.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** Les six dernières agences. Une agence sans voiture est une agence qui n'a pas démarré. */
function RecentOrganizations({ metrics, locale }: { metrics: PlatformMetrics; locale: Locale }) {
  const { t } = useTranslation()

  return (
    <Card className="min-w-0 py-0">
      <CardHeader className="border-b border-border py-4">
        <CardTitle>{t('admin.recentOrganizations')}</CardTitle>
        <CardAction>
          <Button asChild variant="link" size="sm" className="h-11 px-0">
            <Link to="/$lang/admin/organisations" params={{ lang: locale }}>
              {t('admin.seeAll')}
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <ul>
        {metrics.recent.map((org) => (
          <li
            key={org.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{org.name}</p>
              <p className="numeric truncate text-xs text-muted-foreground">
                {org.slug} · {formatDate(org.createdAt, locale)}
              </p>
            </div>
            {org.isDemo ? <Badge variant="accent">{t('app.demo')}</Badge> : null}
            <Badge variant="secondary">{org.planCode}</Badge>
            {/*
              Zéro voiture n'est pas une statistique, c'est un signal : l'agence a été
              créée et n'a jamais été remplie. C'est le seul appel à l'action de la
              page, et il ne s'affiche que quand il a un sens.
            */}
            <span className={`numeric text-xs ${org.vehicles === 0 ? 'text-warning' : 'text-muted-foreground'}`}>
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
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{t('admin.planMix')}</CardTitle>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.noBillableOrganizations')}</p>
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
                  className="mt-1 h-1.5 overflow-hidden rounded-sm bg-muted"
                  role="presentation"
                >
                  <div
                    className="h-full bg-primary"
                    style={{
                      inlineSize: `${highest === 0 ? 0 : Math.round((plan.organizations / highest) * 100)}%`,
                    }}
                  />
                </div>
                <p className="numeric mt-1 text-2xs text-muted-foreground">
                  {formatMoney(plan.monthlyCents, locale, 'MAD', { withDecimals: false })}
                  {' · '}
                  {t('billing.perMonth')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
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
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{t('admin.revenue')}</CardTitle>
        <CardAction>
          <span className="text-2xs text-muted-foreground">{t('admin.last30Days')}</span>
        </CardAction>
      </CardHeader>
      <CardContent>
        {metrics.revenueLast30Days.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.noInvoices')}</p>
        ) : (
          <dl className="space-y-3">
            {metrics.revenueLast30Days.map((line) => (
              <div key={line.currency}>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-muted-foreground">{t('admin.collected')}</dt>
                  <dd className="numeric text-sm text-success">
                    {formatMoney(line.paidCents, locale, line.currency)}
                  </dd>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-muted-foreground">{t('admin.outstanding')}</dt>
                  <dd className={`numeric text-sm ${line.outstandingCents > 0 ? 'text-warning' : ''}`}>
                    {formatMoney(line.outstandingCents, locale, line.currency)}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
