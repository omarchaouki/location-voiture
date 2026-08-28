import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { authClient } from '~/auth/client'
import { formatDate, formatMoney, formatNumber, formatTime } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { Route as AppRoute } from '~/routes/$lang/app'
import { fetchAgencyOverview } from '~/server/dashboard'
import type { AgencyOverview, ExpectedReturn } from '~/server/reads/overview'
import { Button, buttonVariants } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { AgencyDashboardSkeleton } from '~/ui/skeletons'
import { Card, CardBody, CardHeader, PageHeader, SectionTitle, StatGroup } from '~/ui/primitives/card'
import { Plate } from '~/ui/primitives/plate'
import { Badge } from '~/ui/shadcn/badge'

/**
 * TABLEAU DE BORD DE L'AGENCE.
 *
 * Il affichait, depuis la Phase 1, un titre et un bouton « se déconnecter » — un
 * écran d'accueil qui n'accueillait rien. Il répond maintenant aux trois questions
 * qu'un loueur se pose en ouvrant son bureau : où sont mes voitures, qu'est-ce qui
 * rentre aujourd'hui, et qu'est-ce qui va me coûter cher si je l'oublie.
 *
 * L'ordre des blocs suit celui de l'urgence, pas celui du modèle de données : les
 * échéances d'abord, la flotte ensuite. Une page qui commence par un inventaire fait
 * chercher l'urgent.
 */
export const Route = createFileRoute('/$lang/app/')({
  loader: async () => ({ overview: await fetchAgencyOverview() }),
  pendingComponent: AgencyDashboardSkeleton,
  component: DashboardPage,
})

function DashboardPage() {
  const { t } = useTranslation()
  const { viewer } = AppRoute.useLoaderData()
  const { overview } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()

  async function signOut() {
    await authClient.signOut()
    await router.invalidate()
    window.location.assign('/')
  }

  if (!viewer.organization) {
    return (
      <EmptyState
        title={t('app.noOrganization')}
        action={<Button onClick={() => void signOut()}>{t('auth.signOut')}</Button>}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title={viewer.organization.name}
        description={t('home.dashboardBody')}
        meta={
          <>
            <Badge>{viewer.organization.role}</Badge>
            {viewer.organization.isDemo ? <Badge variant="accent">{t('app.demo')}</Badge> : null}
          </>
        }
        action={
          <Link
            to="/$lang/app/contrats/nouveau"
            params={{ lang: locale }}
            className={buttonVariants()}
          >
            {t('contract.add')}
          </Link>
        }
      />

      <Tiles overview={overview} locale={locale} />

      <div className="mt-8">
        <SectionTitle>{t('home.returnsTitle')}</SectionTitle>
        <ExpectedReturns overview={overview} locale={locale} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <NextDeadlines overview={overview} locale={locale} />
        <FleetBreakdown overview={overview} locale={locale} />
      </div>
    </div>
  )
}

function Tiles({ overview, locale }: { overview: AgencyOverview; locale: Locale }) {
  const { t } = useTranslation()

  /*
   * HUIT mesures, et pas quatre.
   *
   * Les quatre premières répondaient au matin ; il manquait tout ce qui se décide dans
   * la journée — le taux d'occupation, l'argent rentré, les permis qui vont bloquer
   * une signature, les contrats non soldés. Un tableau de bord qui n'affiche que
   * l'urgence oblige à ouvrir quatre écrans pour se faire une idée de la semaine.
   *
   * La COULEUR reste réservée à ce qui appelle un geste, et seulement quand ce n'est
   * pas zéro : une mesure rouge qui affiche « 0 » depuis trois mois apprend à ne plus
   * voir le rouge.
   */
  return (
    <StatGroup
      items={[
        {
          key: 'out',
          label: t('home.tileOut'),
          value: formatNumber(overview.fleet.rented, locale),
          hint: t('home.tileOutHint', { available: overview.fleet.available }),
        },
        {
          key: 'utilisation',
          label: t('home.tileUtilisation'),
          value: `${formatNumber(overview.utilisation, locale)} %`,
          hint: t('home.tileUtilisationHint', { total: overview.fleet.total }),
        },
        {
          key: 'dueToday',
          label: t('home.tileDueToday'),
          value: formatNumber(overview.contracts.dueToday, locale),
          hint: t('home.tileDueTodayHint', { upcoming: overview.contracts.upcoming }),
        },
        {
          key: 'late',
          label: t('home.tileLate'),
          tone: overview.contracts.late > 0 ? ('danger' as const) : ('neutral' as const),
          value: formatNumber(overview.contracts.late, locale),
          hint: t('home.tileLateHint', { active: overview.contracts.active }),
        },
        {
          key: 'critical',
          label: t('home.tileCritical'),
          tone:
            overview.alerts.critical > 0
              ? ('danger' as const)
              : overview.alerts.warning > 0
                ? ('warn' as const)
                : ('calm' as const),
          value: formatNumber(overview.alerts.critical, locale),
          hint: t('home.tileCriticalHint', { warning: overview.alerts.warning }),
        },
        {
          key: 'licence',
          label: t('home.tileLicence'),
          tone: overview.customers.licenceExpiring > 0 ? ('warn' as const) : ('neutral' as const),
          value: formatNumber(overview.customers.licenceExpiring, locale),
          hint: t('home.tileLicenceHint', { total: overview.customers.total }),
        },
        {
          key: 'unpaid',
          label: t('home.tileUnpaid'),
          tone: overview.contracts.unpaid > 0 ? ('warn' as const) : ('calm' as const),
          value: formatNumber(overview.contracts.unpaid, locale),
          hint: t('home.tileUnpaidHint'),
        },
        {
          key: 'collected',
          label: t('home.tileCollected'),
          value: formatMoney(overview.money.collectedThisMonthCents, locale, overview.money.currency, {
            withDecimals: false,
          }),
          hint: t('home.tileCollectedHint'),
        },
      ]}
    />
  )
}

/**
 * CE QUI RENTRE — aujourd'hui, demain, après-demain.
 *
 * La demande est venue telle quelle du comptoir : « je veux voir les voitures qui vont
 * entrer demain et après-demain ». C'est la question du SOIR, celle qui permet de
 * promettre une réservation sans se tromper — le compteur « retours aujourd'hui »
 * répondait au matin et s'arrêtait là.
 *
 * Trois colonnes plutôt qu'un filtre à trois positions : la comparaison est le sujet.
 * On veut voir d'un coup d'œil que demain est chargé et après-demain vide, ce qu'un
 * onglet à la fois interdit. Sous 1024 px les colonnes s'empilent, dans le même ordre.
 */
function ExpectedReturns({ overview, locale }: { overview: AgencyOverview; locale: Locale }) {
  const { t } = useTranslation()

  const days = [
    { key: 'today', label: t('home.today'), lines: overview.returns.today },
    { key: 'tomorrow', label: t('home.tomorrow'), lines: overview.returns.tomorrow },
    { key: 'dayAfter', label: t('home.dayAfter'), lines: overview.returns.dayAfter },
  ] as const

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {days.map((day) => (
        <Card key={day.key} className="self-start">
          <CardHeader
            title={day.label}
            hint={t('home.returnsCount', { count: day.lines.length })}
          />
          {day.lines.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted-foreground">{t('home.noReturns')}</p>
            </CardBody>
          ) : (
            <ul>
              {day.lines.map((line) => (
                <ReturnRow key={line.contractId} line={line} locale={locale} />
              ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  )
}

function ReturnRow({ line, locale }: { line: ExpectedReturn; locale: Locale }) {
  const { t } = useTranslation()

  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to="/$lang/app/contrats/$contractId"
        params={{ lang: locale, contractId: line.contractId }}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-accent"
        style={{ minHeight: 'var(--tap-target)' }}
      >
        {/* La plaque est l'identifiant du métier : elle passe en premier, isolée en bidi. */}
        <Plate value={line.plate} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{line.vehicleLabel}</span>
          <span className="block truncate text-xs text-muted-foreground">{line.customerLabel}</span>
        </span>
        <span className="numeric text-sm">{formatTime(line.endAt, locale)}</span>
        {line.late ? <Badge variant="danger">{t('contract.statuses.late')}</Badge> : null}
      </Link>
    </li>
  )
}

/** Les cinq échéances les plus proches. La liste complète vit sur `/alertes`. */
function NextDeadlines({ overview, locale }: { overview: AgencyOverview; locale: Locale }) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader
        title={t('home.nextDeadlines')}
        action={
          <Link
            to="/$lang/app/alertes"
            params={{ lang: locale }}
            className="text-xs text-primary underline underline-offset-4"
          >
            {t('alerts.seeAll')}
          </Link>
        }
      />

      {overview.alerts.soonest.length === 0 ? (
        <CardBody>
          <EmptyState title={t('alerts.none')} body={t('alerts.noneBody')} />
        </CardBody>
      ) : (
        <ul>
          {overview.alerts.soonest.map((alert) => (
            <li
              key={alert.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {t(`alerts.type.${alert.alertType}`)}
              </span>
              {/*
                La sévérité est portée par un CACHET nommé, jamais par la seule
                couleur : un daltonien doit lire la même urgence que les autres.
              */}
              <Badge variant={alert.severity === 'critical' ? 'danger' : 'warn'}>
                {t(`alerts.severity.${alert.severity}`)}
              </Badge>
              <span className="numeric text-xs text-muted-foreground">
                {alert.dueOn ? formatDate(alert.dueOn, locale) : '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Où sont les voitures.
 *
 * Une barre par état, dessinée à la largeur : quatre lignes ne justifient pas
 * d'embarquer une bibliothèque de graphiques dans le paquet. Le chiffre est écrit à
 * côté — une barre sans chiffre se lit à vue de nez, donc se lit faux.
 */
function FleetBreakdown({ overview, locale }: { overview: AgencyOverview; locale: Locale }) {
  const { t } = useTranslation()
  const { fleet } = overview

  const lines = [
    { key: 'available', value: fleet.available },
    { key: 'rented', value: fleet.rented },
    { key: 'maintenance', value: fleet.maintenance },
    { key: 'out_of_service', value: fleet.outOfService },
  ] as const

  return (
    <Card className="self-start">
      <CardHeader
        title={t('home.fleet')}
        hint={t('home.fleetCount', { count: fleet.total })}
        action={
          <Link
            to="/$lang/app/vehicules"
            params={{ lang: locale }}
            className="text-xs text-primary underline underline-offset-4"
          >
            {t('admin.seeAll')}
          </Link>
        }
      />
      <CardBody>
        {fleet.total === 0 ? (
          <p className="text-sm text-muted-foreground">{t('home.fleetEmpty')}</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((line) => (
              <li key={line.key}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm">{t(`vehicle.status.${line.key}`)}</span>
                  <span className="numeric ms-auto text-sm">
                    {formatNumber(line.value, locale)}
                  </span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-sm bg-muted"
                  role="presentation"
                >
                  <div
                    className="h-full bg-primary"
                    style={{
                      inlineSize: `${Math.round((line.value / fleet.total) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
