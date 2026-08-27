import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatDate, formatKilometers, formatMoney } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { listVehicles, type VehicleListRow } from '~/server/vehicles'
import { buttonVariants } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { ChevronEndIcon } from '~/ui/icons'
import { Plate } from '~/ui/primitives/plate'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'
import { VehicleTableSkeleton } from '~/ui/skeletons'

/**
 * Liste des véhicules — un registre, pas un tableau.
 *
 * Marge de plaque en `inline-start`, filets, aucune ombre. La ligne se lit de gauche
 * à droite comme une ligne de registre : identifiant, objet, état, compteur.
 */
export const Route = createFileRoute('/$lang/app/vehicules/')({
  loader: async () => ({ vehicles: await listVehicles() }),
  pendingComponent: VehicleTableSkeleton,
  component: VehiclesPage,
})

const STATUS_TONES: Record<string, BadgeVariant> = {
  available: 'calm',
  rented: 'accent',
  maintenance: 'warn',
  out_of_service: 'danger',
  sold: 'neutral',
}

/** Sévérité → cachet. La couleur double le libellé, elle ne le remplace pas. */
const SEVERITY_TONES: Record<string, BadgeVariant> = {
  blocking: 'danger',
  critical: 'danger',
  high: 'warn',
  medium: 'neutral',
  low: 'neutral',
}

const STATUS_KEYS: Record<string, string> = {
  available: 'vehicle.status.available',
  rented: 'vehicle.status.rented',
  maintenance: 'vehicle.status.maintenance',
  out_of_service: 'vehicle.status.outOfService',
  sold: 'vehicle.status.sold',
}

function VehiclesPage() {
  const { t } = useTranslation()
  const { vehicles } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  return (
    <div>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('vehicle.list.title')}</h1>
        <span className="numeric text-xs text-muted-foreground">
          {t('vehicle.list.count', { count: vehicles.length })}
        </span>
        <span className="ms-auto">
          <Link
            to="/$lang/app/vehicules/nouveau"
            params={{ lang: locale }}
            className={buttonVariants()}
          >
            <span>{t('vehicle.list.add')}</span>
          </Link>
        </span>
      </header>

      {vehicles.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={t('vehicle.list.empty')}
            body={t('vehicle.list.emptyBody')}
            action={
              <Link
                to="/$lang/app/vehicules/nouveau"
                params={{ lang: locale }}
                className={buttonVariants()}
              >
                <span>{t('vehicle.list.add')}</span>
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 border-t border-border">
          {vehicles.map((vehicle) => (
            <VehicleRow key={vehicle.id} vehicle={vehicle} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  )
}

function VehicleRow({
  vehicle,
  locale,
}: {
  vehicle: VehicleListRow
  locale: 'fr' | 'ar' | 'en'
}) {
  const { t } = useTranslation()

  return (
    <li className="border-b border-border">
      <Link
        to="/$lang/app/vehicules/$vehicleId"
        params={{ lang: locale, vehicleId: vehicle.id }}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted"
        /* `--row-height-comfy` (52 px) et non `dense` : sur téléphone, une ligne de
           liste est une CIBLE, pas une rangée de tableau. */
        style={{ minHeight: 'var(--row-height-comfy)' }}
      >
        {/* La marge de registre porte l'identifiant : ici la plaque. */}
        <span className="ledger-margin w-24 sm:w-32 shrink-0 pe-4">
          <Plate value={vehicle.plate} />
        </span>

        <span className="font-medium">
          {vehicle.make} {vehicle.model}
        </span>
        {/* L'année et le prix se replient sur téléphone : ce qu'on cherche dans une
            liste au pouce, c'est la plaque, le modèle, l'état et l'échéance. Le reste
            est à un tap de distance sur la fiche. */}
        {vehicle.year ? (
          <span className="numeric hidden text-xs text-muted-foreground sm:inline">{vehicle.year}</span>
        ) : null}

        <span className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          {/*
            La prochaine échéance, en bout de ligne.

            Elle vient d'une agrégation unique sur `alerts` (voir `readVehicleList`) et
            non d'une requête par ligne. Elle porte son LIBELLÉ, pas seulement une
            couleur : « Assurance » se lit sans savoir ce qu'un cachet orange signifie,
            et un daltonien lit la même chose que les autres.
          */}
          {vehicle.nextDeadline ? (
            <span className="flex items-center gap-2">
              <Badge variant={SEVERITY_TONES[vehicle.nextDeadline.severity] ?? 'neutral'}>
                {t(`alerts.type.${vehicle.nextDeadline.alertType}`)}
              </Badge>
              {vehicle.nextDeadline.dueOn ? (
                <span className="numeric hidden text-2xs text-muted-foreground sm:inline">
                  {formatDate(vehicle.nextDeadline.dueOn, locale)}
                </span>
              ) : null}
            </span>
          ) : null}

          <Badge variant={STATUS_TONES[vehicle.status] ?? 'neutral'}>
            {t(STATUS_KEYS[vehicle.status] ?? 'vehicle.status.available')}
          </Badge>
          <span className="numeric text-xs text-muted-foreground">
            {formatKilometers(vehicle.currentKm, locale)} km
          </span>
          {vehicle.dailyCents !== null ? (
            <span className="numeric hidden text-xs text-muted-foreground sm:inline">
              {formatMoney(vehicle.dailyCents, locale, 'MAD', { withDecimals: false })}
            </span>
          ) : null}
          <ChevronEndIcon size={16} className="text-muted-foreground" />
        </span>
      </Link>
    </li>
  )
}
