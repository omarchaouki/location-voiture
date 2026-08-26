// i18n-exempt — page de vérification INTERNE, jamais exposée à un client.
// Elle affiche des libellés destinés au développeur (noms de jetons, tailles de
// l'échelle) et des données de démonstration (marque et modèle d'un véhicule) qui
// ne se traduisent pas. Toute page destinée à un utilisateur passe par i18n.
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { addCivilDays } from '~/core/dates'
import { businessCivilDate, formatMoney, formatKilometers } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { EmptyState, ErrorState } from '~/ui/feedback/states'
import { ICON_REGISTRY } from '~/ui/icons/registry'
import { LogbookRail, type LogbookEntry } from '~/ui/logbook/logbook-rail'
import { AccountMenu } from '~/ui/account/account-menu'
import { MapView } from '~/ui/map/map-view'
import { APP_DESTINATIONS } from '~/ui/nav/destinations'
import { NavStrip, SideRail } from '~/ui/nav/shell'
import { Button } from '~/ui/primitives/button'
import { Plate } from '~/ui/primitives/plate'
import { Stamp } from '~/ui/primitives/stamp'
import {
  AdminOrganizationsSkeleton,
  AlertListSkeleton,
  DashboardSkeleton,
  MapSkeleton,
  VehicleFileSkeleton,
  VehicleTableSkeleton,
} from '~/ui/skeletons'

/**
 * Socle de design — surface de vérification interne.
 *
 * Elle existe pour regarder les jetons, les primitives, la frise et les squelettes
 * à l'œil, dans les deux thèmes, les trois langues, à 360 px et à 1440 px. Elle
 * n'est pas destinée aux clients et ne sera pas exposée en production.
 *
 * TODO (Phase 2) : la placer derrière le rôle `platform_owner` une fois
 * l'authentification en place.
 */
export const Route = createFileRoute('/$lang/design')({
  // La date « aujourd'hui » est calculée côté serveur puis sérialisée : sinon un
  // rendu serveur à 23h59 et une hydratation à 00h00 ne diraient pas la même chose.
  loader: () => ({ today: businessCivilDate(new Date()) }),
  component: DesignPage,
})

const PALETTE: ReadonlyArray<{ token: string; role: string }> = [
  { token: '--paper', role: 'Fond de page' },
  { token: '--surface', role: 'Zone de saisie et de tableau' },
  { token: '--surface-sunken', role: 'Creux, squelette' },
  { token: '--ink', role: 'Texte principal, filets forts' },
  { token: '--muted', role: 'Libellés, métadonnées' },
  { token: '--rule', role: 'Filets' },
  { token: '--stamp', role: 'Accent unique : aujourd’hui, action principale' },
  { token: '--calm', role: 'Sévérité : à jour' },
  { token: '--warn', role: 'Sévérité : échéance proche' },
  { token: '--danger', role: 'Sévérité : dépassé, bloquant' },
]

const TYPE_SCALE: ReadonlyArray<{ className: string; label: string }> = [
  { className: 'text-3xl font-display', label: '3xl · 40 · display' },
  { className: 'text-2xl font-display', label: '2xl · 32 · display' },
  { className: 'text-xl font-display', label: 'xl · 25 · display' },
  { className: 'text-lg', label: 'lg · 20 · sans' },
  { className: 'text-md', label: 'md · 17 · sans' },
  { className: 'text-base', label: 'base · 15 · sans' },
  { className: 'text-sm', label: 'sm · 13 · sans' },
  { className: 'text-xs text-muted', label: 'xs · 12 · sans' },
  { className: 'text-2xs text-muted', label: '2xs · 11 · sans' },
]

function DesignPage() {
  const { t, i18n } = useTranslation()
  const { today } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const [showSkeletons, setShowSkeletons] = useState(false)

  // Données de démonstration : véhicule réellement loué au Maroc, échéances
  // calculées par rapport à aujourd'hui. Une démo aux dates figées meurt en un an.
  const entries: ReadonlyArray<LogbookEntry> = [
    { id: 'a', kind: 'maintenanceDone', date: addCivilDays(today, -160), state: 'done', detail: '74 210 km' },
    { id: 'b', kind: 'contractReturn', date: addCivilDays(today, -80), state: 'done' },
    { id: 'c', kind: 'roadTax', date: addCivilDays(today, -14), state: 'overdue' },
    { id: 'd', kind: 'contractReturn', date: addCivilDays(today, 2), state: 'upcoming' },
    { id: 'e', kind: 'oilChange', date: addCivilDays(today, 12), state: 'upcoming', detail: '~800 km' },
    { id: 'f', kind: 'inspection', date: addCivilDays(today, 74), state: 'upcoming' },
    { id: 'g', kind: 'insurance', date: addCivilDays(today, 205), state: 'upcoming' },
  ]

  return (
    <div className="space-y-14">
      <header className="max-w-prose">
        <h1 className="font-display text-2xl">{t('design.title')}</h1>
        <p className="mt-3 text-sm text-muted">{t('design.intro')}</p>
        <p className="mt-2 text-xs text-muted">
          <span className="numeric">{i18n.language}</span> · {today}
        </p>
      </header>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('design.timeline')}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-rule pb-3">
          <Plate value="12345 | أ | 6" size="lg" />
          <span className="font-display text-md">Dacia Logan 2023</span>
          <span className="text-xs text-muted">
            {formatKilometers(91340, locale)} km · {formatMoney(28000, locale)}
          </span>
          <span className="ms-auto">
            <Stamp tone="accent">{t('vehicle.status.rented')}</Stamp>
          </span>
        </div>
        <LogbookRail className="mt-6" entries={entries} today={today} />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('design.palette')}>
        <ul className="grid gap-px bg-rule sm:grid-cols-2">
          {PALETTE.map((swatch) => (
            <li key={swatch.token} className="flex items-center gap-3 bg-paper p-3">
              <span
                className="h-9 w-9 shrink-0 border border-rule-strong"
                style={{ backgroundColor: `var(${swatch.token})` }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <code className="numeric text-xs">{swatch.token}</code>
                <span className="block text-xs text-muted">{swatch.role}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('design.typography')}>
        <ul className="divide-y divide-rule">
          {TYPE_SCALE.map((step) => (
            <li key={step.label} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 py-3">
              <span className={step.className}>{t('brand.tagline')}</span>
              <span className="numeric ms-auto text-2xs text-muted">{step.label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-rule pt-4">
          <Plate value="12345 | أ | 6" />
          <Plate value="27819 | ب | 1" />
          <Plate value="WW 4471" />
          <span className="numeric text-sm">{formatMoney(125000, locale)}</span>
          <span className="numeric text-sm">{formatKilometers(1234567, locale)} km</span>
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('design.icons')}>
        <ul className="grid grid-cols-3 gap-px bg-rule sm:grid-cols-6 lg:grid-cols-8">
          {ICON_REGISTRY.map(({ name, Component }) => (
            <li key={name} className="flex flex-col items-center gap-2 bg-paper p-3 text-center">
              <Component size={24} />
              <span className="text-2xs break-all text-muted">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('design.states')}>
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">{t('action.add')}</Button>
            <Button variant="secondary">{t('action.export')}</Button>
            <Button variant="ghost">{t('action.filter')}</Button>
            <Button variant="danger">{t('action.cancel')}</Button>
            <Button variant="secondary" disabled>
              {t('action.save')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Stamp>{t('vehicle.status.available')}</Stamp>
            <Stamp tone="accent">{t('vehicle.status.rented')}</Stamp>
            <Stamp tone="warn">{t('vehicle.status.maintenance')}</Stamp>
            <Stamp tone="danger">{t('deadline.expired')}</Stamp>
            <Stamp tone="calm">{t('deadline.done')}</Stamp>
          </div>
          <EmptyState
            title={t('state.empty')}
            body={t('design.intro')}
            action={<Button variant="primary">{t('action.add')}</Button>}
          />
          <ErrorState error={new Error('demo: quota exceeded')} />
        </div>
      </Section>

      {/* ---------------------------------------------------------------- */}
      {/*
        La carte, sur la surface de vérification.

        Elle est ici parce que c'est le seul endroit où on peut la REGARDER sans
        session : thème clair et sombre, `fr` et `ar`, 360 px et 1440 px. Les
        données sont fixes et locales — aucun fond de carte n'est chargé, donc
        aucune requête ne part vers un tiers depuis une page de vérification.
      */}
      {/*
        Le menu de compte, avec une session FABRIQUÉE.

        C'est la seule surface où l'on peut l'ouvrir, le fermer, le parcourir au
        clavier et le regarder en arabe sans ouvrir de session — donc le seul endroit
        où ses règles d'accessibilité se vérifient vraiment.
      */}
      {/* La barre de navigation, avec la session fabriquée : c'est le seul endroit
          où l'on peut la mesurer à 320 et 375 px sans ouvrir de session. */}
      <Section title="Barre de navigation">
        <NavStrip locale={locale} destinations={APP_DESTINATIONS} label={t('nav.primary')} />
      </Section>

      {/* Le rail vertical — ce que l'on voit à partir de 1024 px. Posé dans une boîte
          de la largeur réelle de la colonne (240 px) pour être mesurable ici. */}
      <Section title="Rail de navigation">
        <div className="flex w-60 flex-col border border-rule bg-surface">
          <SideRail locale={locale} destinations={APP_DESTINATIONS} label="Rail de démonstration" />
        </div>
      </Section>

      <Section title="Menu de compte">
        {/* Aligné en bout de ligne, comme dans la barre de navigation réelle : c'est
            la position qui décide du sens dans lequel le panneau se déplie. */}
        <div className="flex justify-end">
          <AccountMenu viewer={DEMO_VIEWER} locale={locale} />
        </div>
      </Section>

      <Section title="Carte">
        <MapView
          styleUrl={null}
          label="Carte de démonstration"
          height="20rem"
          markers={MAP_DEMO_MARKERS}
          shapes={MAP_DEMO_SHAPES}
          track={MAP_DEMO_TRACK}
          bounds={{ south: 33.56, west: -7.68, north: 33.62, east: -7.56 }}
        />
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section title={t('design.skeletons')}>
        <label
          className="mb-4 flex items-center gap-2 text-sm"
          style={{ minHeight: 'var(--tap-target)' }}
        >
          <input
            type="checkbox"
            checked={showSkeletons}
            onChange={(event) => setShowSkeletons(event.target.checked)}
          />
          {t('design.toggleSkeletons')}
        </label>
        {showSkeletons ? (
          <div className="space-y-10">
            <DashboardSkeleton />
            <VehicleTableSkeleton rows={4} />
            <VehicleFileSkeleton />
            <AlertListSkeleton rows={3} />
            <MapSkeleton />
            <AdminOrganizationsSkeleton rows={4} />
          </div>
        ) : null}
      </Section>
    </div>
  )
}

/** Session fabriquée pour regarder le menu de compte hors connexion. */
const DEMO_VIEWER = {
  userId: 'demo',
  email: 'karim.benali@atlas-cars.ma',
  name: 'Karim Benali',
  isPlatformOwner: false,
  organization: {
    id: 'demo-org',
    name: 'Atlas Cars',
    status: 'active',
    isDemo: true,
    role: 'manager' as const,
    canWrite: true,
  },
  impersonation: null,
}

/** Données fixes de la carte de démonstration : trois voitures autour de Casablanca. */
const MAP_DEMO_MARKERS = [
  { id: 'a', lat: 33.5945, lng: -7.6167, label: '12345 | أ | 6', tone: 'ink' as const },
  { id: 'b', lat: 33.5731, lng: -7.6631, label: '27819 | ب | 1', tone: 'stamp' as const },
  { id: 'c', lat: 33.61, lng: -7.58, label: '40021 | د | 12', tone: 'muted' as const },
]

const MAP_DEMO_SHAPES = [
  {
    id: 'zone',
    kind: 'circle' as const,
    center: { lat: 33.5945, lng: -7.6167 },
    radiusM: 2_500,
  },
]

const MAP_DEMO_TRACK = [
  { lat: 33.5731, lng: -7.6631 },
  { lat: 33.582, lng: -7.64 },
  { lat: 33.5945, lng: -7.6167 },
  { lat: 33.61, lng: -7.58 },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 border-b-2 border-rule-strong pb-2 font-display text-lg">{title}</h2>
      {children}
    </section>
  )
}
