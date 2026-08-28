import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatCoordinate, formatDateTime, formatNumber } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { MOVING_KMH } from '~/core/tracking'
import {
  createGeofence,
  deleteGeofence,
  listRecentCrossings,
  loadFleetSnapshot,
  registerDevice,
  syncNow,
  type FleetPosition,
  type FleetSnapshot,
  type GeofenceSummary,
} from '~/server/gps'
import { Button } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { GeofenceIcon, GpsIcon } from '~/ui/icons'
import { MapView, type MapMarker, type MapShape } from '~/ui/map/map-view'
import { Plate } from '~/ui/primitives/plate'
import { Badge } from '~/ui/shadcn/badge'
import { MapSkeleton } from '~/ui/skeletons'
import { Field, Picker } from '~/ui/forms/fields'

/**
 * SUIVI — la carte de la flotte.
 *
 * L'écran répond à une question et à une seule : où sont les voitures, et depuis
 * quand. Le « depuis quand » compte autant que le « où » — un point vieux de six
 * heures affiché comme s'il était frais est pire qu'une absence de point, parce
 * qu'on agit dessus.
 *
 * La carte n'est pas un tableau de bord : pas de camaïeu, pas de dégradé de chaleur.
 * Un cadre, un filet, une plaque — la même langue que le reste du registre.
 */
export const Route = createFileRoute('/$lang/app/suivi')({
  loader: async () => ({
    snapshot: await loadFleetSnapshot(),
    crossings: await listRecentCrossings(),
  }),
  pendingComponent: MapSkeleton,
  component: TrackingPage,
})

function TrackingPage() {
  const { t } = useTranslation()
  const { snapshot, crossings } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()

  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  /* Zone en cours de tracé. Le centre vient d'un CLIC sur la carte : taper des
     coordonnées à la main n'est un geste que personne ne réussit du premier coup. */
  const [draftCentre, setDraftCentre] = useState<{ lat: number; lng: number } | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftRadius, setDraftRadius] = useState(2_000)

  /*
   * Offre insuffisante : ce n'est pas une erreur, c'est une proposition. On dit le
   * plan courant et ce qu'il faut pour ouvrir la fonctionnalité — jamais une page
   * d'erreur, qui enverrait le client au support au lieu du commercial.
   */
  if (snapshot.locked) {
    return (
      <div>
        <PageHeader locale={locale} />
        <div className="mt-8">
          <EmptyState
            title={t('gps.lockedTitle')}
            body={t('gps.lockedBody', { plan: snapshot.planCode })}
          />
        </div>
      </div>
    )
  }

  async function refresh() {
    setBusy(true)
    setNotice(null)
    try {
      const result = await syncNow()
      if (result.locked) return
      setNotice(
        result.inserted === 0
          ? t('gps.syncedNone')
          : t('gps.synced', { count: result.inserted }),
      )
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  const markers: MapMarker[] = snapshot.positions.map((position) => ({
    id: position.vehicleId,
    lat: position.lat,
    lng: position.lng,
    label: position.plate,
    tone: position.stale ? 'muted' : isMoving(position) ? 'stamp' : 'ink',
  }))

  const shapes: MapShape[] = snapshot.geofences
    .filter((zone) => zone.isActive)
    .map((zone) =>
      zone.geometry.kind === 'circle'
        ? {
            id: zone.id,
            kind: 'circle' as const,
            center: zone.geometry.center,
            radiusM: zone.geometry.radiusM,
          }
        : { id: zone.id, kind: 'polygon' as const, ring: zone.geometry.ring },
    )

  // La zone en cours de tracé s'affiche AVANT d'être enregistrée : on choisit un
  // rayon en le voyant sur sa ville, pas en imaginant ce que valent 2 000 mètres.
  if (draftCentre) {
    shapes.push({ id: 'draft', kind: 'circle', center: draftCentre, radiusM: draftRadius })
  }

  return (
    <div>
      <PageHeader locale={locale}>
        <span className="numeric text-xs text-muted-foreground">
          {t('gps.count', { count: snapshot.positions.length })}
        </span>
        <span className="ms-auto flex items-center gap-3">
          {notice ? <span className="text-xs text-muted-foreground">{notice}</span> : null}
          <Button
            onClick={() => {
              void refresh()
            }}
            disabled={busy}
          >
            {busy ? t('gps.syncing') : t('gps.sync')}
          </Button>
        </span>
      </PageHeader>

      {snapshot.positions.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t('gps.emptyTitle')} body={t('gps.emptyBody')} />
        </div>
      ) : (
        <div className="mt-6">
          <MapView
            styleUrl={snapshot.styleUrl}
            markers={markers}
            shapes={shapes}
            bounds={snapshot.bounds}
            selectedId={selected}
            onSelect={setSelected}
            onMapClick={setDraftCentre}
            label={t('gps.mapLabel')}
          />
          {snapshot.styleUrl === null ? (
            <p className="mt-2 text-2xs text-muted-foreground">{t('gps.blankStyle')}</p>
          ) : null}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="flex items-center gap-2 border-b border-border pb-2 text-base">
            <GpsIcon size={16} className="text-muted-foreground" />
            <span>{t('gps.title')}</span>
          </h2>
          <ul>
            {snapshot.positions.map((position) => (
              <PositionRow
                key={position.vehicleId}
                position={position}
                locale={locale}
                selected={position.vehicleId === selected}
                onSelect={() => setSelected(position.vehicleId)}
              />
            ))}
          </ul>

          {snapshot.untracked.length > 0 ? (
            <div className="mt-6">
              <h3 className="border-b border-border pb-2 text-sm text-muted-foreground">
                {t('gps.untrackedTitle')}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground">{t('gps.untrackedBody')}</p>
              <ul className="mt-2">
                {snapshot.untracked.map((vehicle) => (
                  <li
                    key={vehicle.id}
                    className="flex items-center gap-4 border-b border-border px-4 py-2"
                  >
                    <span className="ledger-margin w-24 sm:w-28 shrink-0 pe-4">
                      <Plate value={vehicle.plate} size="sm" />
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {vehicle.make} {vehicle.model}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="flex items-center gap-2 border-b border-border pb-2 text-base">
            <GeofenceIcon size={16} className="text-muted-foreground" />
            <span>{t('gps.zonesTitle')}</span>
          </h2>
          {snapshot.geofences.length === 0 ? (
            <p className="mt-3 max-w-prose text-sm text-muted-foreground">{t('gps.zonesEmpty')}</p>
          ) : (
            <ul className="mt-2">
              {snapshot.geofences.map((zone) => (
                <ZoneRow
                  key={zone.id}
                  zone={zone}
                  locale={locale}
                  onDeleted={() => {
                    void router.invalidate()
                  }}
                />
              ))}
            </ul>
          )}

          <ZoneComposer
            centre={draftCentre}
            name={draftName}
            radius={draftRadius}
            locale={locale}
            onName={setDraftName}
            onRadius={setDraftRadius}
            onSaved={() => {
              setDraftCentre(null)
              setDraftName('')
              setNotice(t('gps.zoneCreated'))
              void router.invalidate()
            }}
          />

          <DeviceComposer
            untracked={snapshot.untracked}
            onSaved={(message) => {
              setNotice(message)
              void router.invalidate()
            }}
          />

          <h2 className="mt-8 border-b border-border pb-2 text-base">
            {t('gps.crossingsTitle')}
          </h2>
          {crossings.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('gps.crossingsEmpty')}</p>
          ) : (
            <ul className="mt-2">
              {crossings.map((crossing) => (
                <li
                  key={crossing.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2"
                >
                  <span className="ledger-margin w-24 sm:w-28 shrink-0 pe-4">
                    <Plate value={crossing.plate} size="sm" />
                  </span>
                  <Badge variant={crossing.kind === 'exit' ? 'warn' : 'calm'}>
                    {crossing.kind === 'exit' ? t('gps.crossingExit') : t('gps.crossingEnter')}
                  </Badge>
                  <span className="text-sm">{crossing.geofenceName}</span>
                  <span className="numeric ms-auto text-xs text-muted-foreground">
                    {formatDateTime(crossing.occurredAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function PageHeader({ locale, children }: { locale: Locale; children?: React.ReactNode }) {
  const { t } = useTranslation()

  return (
    <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-input pb-3">
      <h1 className="text-2xl">{t('gps.title')}</h1>
      <span className="text-xs text-muted-foreground">{t('gps.subtitle')}</span>
      {children}
      <Link
        to="/$lang/app/vehicules"
        params={{ lang: locale }}
        className="sr-only focus:not-sr-only"
      >
        {t('nav.vehicles')}
      </Link>
    </header>
  )
}

function isMoving(position: FleetPosition): boolean {
  return position.speedKmh !== null && position.speedKmh >= MOVING_KMH
}

/**
 * Une ligne de flotte.
 *
 * L'âge du relevé est en toutes lettres, pas en horodatage : « il y a 4 minutes »
 * se lit sans calcul, « 14:32 » demande de savoir l'heure qu'il est. Un véhicule
 * sans signal porte un cachet, pas seulement une couleur plus pâle.
 */
function PositionRow({
  position,
  locale,
  selected,
  onSelect,
}: {
  position: FleetPosition
  locale: Locale
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()

  return (
    <li className={`border-b ${selected ? 'border-primary' : 'border-border'}`}>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-start hover:bg-muted"
        /* 44 px et non la hauteur de ligne dense de 40 px : cette ligne est ce qui
           rachète le repère de carte, trop petit pour un pouce. Il faut donc qu'elle
           soit, elle, une vraie cible tactile. */
        style={{ minHeight: 'var(--tap-target)' }}
      >
        <span className="ledger-margin w-24 sm:w-28 shrink-0 pe-4">
          <Plate value={position.plate} size="sm" />
        </span>
        <span className="text-sm">
          {position.make} {position.model}
        </span>

        <span className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          {position.stale ? (
            <Badge variant="neutral">{t('gps.stale')}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              {isMoving(position) ? t('gps.moving') : t('gps.parked')}
            </span>
          )}
          {position.speedKmh !== null && isMoving(position) ? (
            <span className="numeric text-xs">
              {t('gps.speed', { speed: formatNumber(Math.round(position.speedKmh), locale) })}
            </span>
          ) : null}
          <span className="numeric text-xs text-muted-foreground">
            {/* En minutes tant que c'est parlant, en heures ensuite : « il y a 4
                minutes » se lit sans calcul, « 14:32 » demande de savoir l'heure. */}
            {position.ageMinutes < 90
              ? t('gps.ageMinutes', { count: position.ageMinutes })
              : t('gps.ageHours', { count: Math.round(position.ageMinutes / 60) })}
          </span>
        </span>
      </button>
    </li>
  )
}

/**
 * Tracé d'une zone.
 *
 * Le centre se pose d'un clic sur la carte et le cercle apparaît aussitôt : choisir
 * « 2 000 mètres » sans le voir posé sur sa ville ne veut rien dire pour personne.
 * Le bouton reste inerte tant qu'il manque quelque chose, et la phrase au-dessus dit
 * quoi — plutôt qu'un message d'erreur après coup.
 */
function ZoneComposer({
  centre,
  name,
  radius,
  locale,
  onName,
  onRadius,
  onSaved,
}: {
  centre: { lat: number; lng: number } | null
  name: string
  radius: number
  locale: Locale
  onName: (value: string) => void
  onRadius: (value: number) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!centre || name.trim().length === 0) return
    setSaving(true)
    try {
      await createGeofence({
        data: {
          name: name.trim(),
          geometry: { kind: 'circle', center: centre, radiusM: radius },
          appliesTo: 'all',
          appliesToValue: null,
        },
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm text-muted-foreground">{t('gps.newZone')}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field
          label={t('gps.zoneName')}
          numeric={false}
          value={name}
          onChange={(event) => onName(event.target.value)}
        />
        <Field
          label={t('gps.zoneRadiusField')}
          type="number"
          min={50}
          max={200000}
          step={50}
          value={radius}
          onChange={(event) => onRadius(Number(event.target.value))}
        />
      </div>
      <p className="mt-2 text-2xs text-muted-foreground">
        {centre
          ? t('gps.zoneCentreSet', {
              lat: formatCoordinate(centre.lat, locale),
              lng: formatCoordinate(centre.lng, locale),
            })
          : t('gps.zonePickCentre')}
      </p>
      <div className="mt-3">
        <Button
          variant="default"
          disabled={saving || !centre || name.trim().length === 0}
          onClick={() => {
            void save()
          }}
        >
          {t('gps.zoneCreate')}
        </Button>
      </div>
    </section>
  )
}

/** Déclaration d'un boîtier : une voiture sans traceur, un IMEI. Rien de plus. */
function DeviceComposer({
  untracked,
  onSaved,
}: {
  untracked: FleetSnapshot['untracked']
  onSaved: (message: string) => void
}) {
  const { t } = useTranslation()
  const [vehicleId, setVehicleId] = useState('')
  const [externalId, setExternalId] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!vehicleId || externalId.trim().length === 0) return
    setSaving(true)
    try {
      const result = await registerDevice({
        data: { vehicleId, provider: 'mock', externalId: externalId.trim() },
      })
      setExternalId('')
      // Le message dit LEQUEL des deux cas s'est produit : déclarer deux fois le même
      // boîtier n'est pas une erreur, mais ce n'est pas non plus une création.
      onSaved(result.alreadyKnown ? t('gps.deviceAlreadyKnown') : t('gps.deviceCreated'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="text-sm text-muted-foreground">{t('gps.newDevice')}</h3>
      {untracked.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('gps.deviceNoVehicle')}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {/*
              Saisie assistée plutôt qu'une liste déroulante : une flotte de quarante
              voitures se cherche à la plaque, pas en faisant défiler. Le champ garde
              son état interne ; l'écran s'aligne dessus par `onValueChange`.
            */}
            <Picker
              name="vehicleId"
              label={t('gps.deviceVehicle')}
              onValueChange={setVehicleId}
              options={untracked.map((vehicle) => ({
                value: vehicle.id,
                label: `${vehicle.make} ${vehicle.model}`,
                detail: vehicle.plate,
              }))}
            />
            <Field
              label={t('gps.deviceExternalId')}
              value={externalId}
              onChange={(event) => setExternalId(event.target.value)}
            />
          </div>
          <p className="mt-2 max-w-prose text-2xs text-muted-foreground">{t('gps.deviceHint')}</p>
          <div className="mt-3">
            <Button
              disabled={saving || !vehicleId || externalId.trim().length === 0}
              onClick={() => {
                void save()
              }}
            >
              {t('gps.deviceCreate')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function ZoneRow({
  zone,
  locale,
  onDeleted,
}: {
  zone: GeofenceSummary
  locale: Locale
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const [removing, setRemoving] = useState(false)

  const scope =
    zone.appliesTo === 'vehicle'
      ? t('gps.zoneScopeVehicle')
      : zone.appliesTo === 'category'
        ? t('gps.zoneScopeCategory')
        : t('gps.zoneScopeAll')

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2">
      <span className="text-sm">{zone.name}</span>
      <span className="numeric text-xs text-muted-foreground">
        {zone.geometry.kind === 'circle'
          ? t('gps.zoneRadius', { radius: formatNumber(zone.geometry.radiusM, locale) })
          : t('gps.zonePolygon', { count: zone.geometry.ring.length })}
      </span>
      <span className="ms-auto text-xs text-muted-foreground">{scope}</span>
      {zone.isActive ? null : <Badge variant="neutral">{t('gps.zoneInactive')}</Badge>}
      {/* Suppression DOUCE côté serveur : les franchissements déjà constatés gardent
          une zone à nommer, sinon l'historique parlerait d'un identifiant nu. */}
      <Button
        variant="ghost"
        disabled={removing}
        onClick={() => {
          setRemoving(true)
          void deleteGeofence({ data: { id: zone.id } }).then(onDeleted)
        }}
      >
        {t('gps.zoneDelete')}
      </Button>
    </li>
  )
}
