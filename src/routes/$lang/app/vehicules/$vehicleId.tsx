import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatDate, formatDateTime, formatKilometers, formatMoney } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { getVehicleFile, type VehicleFile } from '~/server/vehicles'
import { buttonVariants } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import {
  InsuranceShieldIcon,
  InspectionBadgeIcon,
  RegistrationCardIcon,
  RoadTaxStickerIcon,
} from '~/ui/icons'
import { LogbookRail } from '~/ui/logbook/logbook-rail'
import { Plate } from '~/ui/primitives/plate'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'
import { VehicleFileSkeleton } from '~/ui/skeletons'
import { DocumentForm } from '~/ui/vehicles/document-form'

/**
 * LA FICHE VÉHICULE — la signature du produit.
 *
 * Un carnet d'entretien : l'identité en tête, le relevé, puis la frise où le temps
 * descend vers la ligne « aujourd'hui ». On ne lit pas une liste de dates, on voit le
 * temps arriver sur la voiture. docs/DESIGN.md §5.
 */
export const Route = createFileRoute('/$lang/app/vehicules/$vehicleId')({
  loader: async ({ params }) => ({ file: await getVehicleFile({ data: { id: params.vehicleId } }) }),
  pendingComponent: VehicleFileSkeleton,
  component: VehicleFilePage,
})

const STATUS_TONES: Record<string, BadgeVariant> = {
  available: 'calm',
  rented: 'accent',
  maintenance: 'warn',
  out_of_service: 'danger',
  sold: 'neutral',
}

const STATUS_KEYS: Record<string, string> = {
  available: 'vehicle.status.available',
  rented: 'vehicle.status.rented',
  maintenance: 'vehicle.status.maintenance',
  out_of_service: 'vehicle.status.outOfService',
  sold: 'vehicle.status.sold',
}

function VehicleFilePage() {
  const { t } = useTranslation()
  const { file } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const vehicle = file.vehicle

  return (
    <div>
      {/* --- Identité : la plaque est l'identifiant, en tête et isolée en bidi. --- */}
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-rule pb-3">
        <Plate value={vehicle.plate} size="lg" />
        <span className="font-display text-md">
          {vehicle.make} {vehicle.model}
          {vehicle.year ? ` ${vehicle.year}` : ''}
        </span>
        {vehicle.fuel ? <span className="text-xs text-muted">{t(`vehicle.fuel.${vehicle.fuel}`)}</span> : null}
        {vehicle.gearbox ? (
          <span className="text-xs text-muted">{t(`vehicle.gearbox.${vehicle.gearbox}`)}</span>
        ) : null}
        <span className="ms-auto flex items-center gap-4">
          <Badge variant={STATUS_TONES[vehicle.status] ?? 'neutral'}>
            {t(STATUS_KEYS[vehicle.status] ?? 'vehicle.status.available')}
          </Badge>
          <Link
            to="/$lang/app/vehicules"
            params={{ lang: locale }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('vehicle.list.backToList')}</span>
          </Link>
        </span>
      </header>

      {/* --- Relevé : ce qui pilote toutes les échéances d'entretien. --- */}
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule py-3 text-sm">
        <span className="numeric text-md">
          {formatKilometers(vehicle.currentKm, locale)} km
        </span>
        <span className="text-xs text-muted">
          {vehicle.currentKmAt
            ? `${t('vehicle.file.recordedAt')} ${formatDateTime(vehicle.currentKmAt, locale)}`
            : t('vehicle.file.never')}
        </span>
        {vehicle.dailyCents !== null ? (
          <span className="numeric ms-auto text-xs text-muted">
            {formatMoney(vehicle.dailyCents, locale)}
          </span>
        ) : null}
      </p>

      {/* --- LE CARNET. --- */}
      <section className="mt-8">
        <h2 className="mb-2 font-display text-lg">{t('vehicle.file.logbook')}</h2>
        {file.entries.length === 0 ? (
          <EmptyState
            title={t('vehicle.file.noEntries')}
            body={t('vehicle.file.noEntriesBody')}
          />
        ) : (
          <LogbookRail entries={file.entries} today={file.today} />
        )}
      </section>

      {/* --- Documents : ce que le carnet résume, sous forme de pièces. --- */}
      <section className="mt-12">
        <h2 className="mb-4 border-b border-rule pb-2 font-display text-lg">
          {t('vehicle.file.documents')}
        </h2>
        <ul className="grid gap-px bg-rule sm:grid-cols-2">
          <DocumentCard
            icon={<InsuranceShieldIcon size={20} />}
            label={t('deadline.insurance')}
            value={file.documents.insurance?.company ?? null}
            detail={
              file.documents.insurance
                ? `${t('vehicle.file.expiresOn')} ${formatDate(file.documents.insurance.expiresOn, locale)}`
                : null
            }
            locale={locale}
          />
          <DocumentCard
            icon={<InspectionBadgeIcon size={20} />}
            label={t('deadline.inspection')}
            value={file.documents.inspection?.centerName ?? null}
            detail={
              file.documents.inspection
                ? `${t('vehicle.file.expiresOn')} ${formatDate(file.documents.inspection.expiresOn, locale)}`
                : null
            }
            locale={locale}
          />
          <DocumentCard
            icon={<RoadTaxStickerIcon size={20} />}
            label={t('deadline.roadTax')}
            value={file.documents.roadTax ? String(file.documents.roadTax.year) : null}
            detail={
              file.documents.roadTax
                ? file.documents.roadTax.paidAt
                  ? `${t('vehicle.file.paidOn')} ${formatDate(file.documents.roadTax.paidAt, locale)}`
                  : t('vehicle.file.unpaid')
                : null
            }
            locale={locale}
          />
          {/* La carte grise n'expire pas au Maroc : pas de date, pas d'alerte. É1. */}
          <DocumentCard
            icon={<RegistrationCardIcon size={20} />}
            label={t('entity.registration')}
            value={file.documents.registration?.registrationNumber ?? null}
            detail={null}
            locale={locale}
          />
        </ul>

        <div className="mt-8">
          <h3 className="mb-4 font-display text-md">{t('vehicle.file.addDocument')}</h3>
          <DocumentForm vehicleId={vehicle.id} />
        </div>
      </section>
    </div>
  )
}

function DocumentCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  detail: string | null
  locale: Locale
}) {
  const { t } = useTranslation()

  return (
    <li className="flex items-start gap-3 bg-paper p-4">
      <span className="mt-[2px] text-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        {value === null ? (
          <span className="mt-1 block text-sm text-warn">{t('vehicle.file.missing')}</span>
        ) : (
          <>
            <span className="mt-1 block text-sm">{value}</span>
            {detail ? <span className="numeric block text-xs text-muted">{detail}</span> : null}
          </>
        )}
      </span>
    </li>
  )
}

export type { VehicleFile }
