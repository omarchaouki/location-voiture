import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDate, formatDateTime, formatKilometers, formatMoney } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import type { DocumentType } from '~/core/schemas/document'
import { deleteDocument } from '~/server/documents'
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
import { PrintButton, PrintHeader } from '~/ui/print/printable'
import { centsToInput, DocumentForm, type EditingDocument } from '~/ui/vehicles/document-form'

/**
 * LA FICHE VÉHICULE — la signature du produit.
 *
 * Un carnet d'entretien : l'identité en tête, le relevé, puis la frise où le temps
 * descend vers la ligne « aujourd'hui ». On ne lit pas une liste de dates, on voit le
 * temps arriver sur la voiture. docs/DESIGN.md §5.
 */
export const Route = createFileRoute('/$lang/app/vehicules/$vehicleId/')({
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

function VehicleFilePage() {
  const { t } = useTranslation()
  const { file } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const vehicle = file.vehicle
  const documents = file.documents

  /*
   * La correction se pilote depuis la PAGE, pas depuis la carte.
   *
   * Les quatre pièces sont dans une grille à deux colonnes ; y déplier un formulaire
   * de cinq champs écraserait la carte voisine. Le formulaire s'ouvre donc SOUS la
   * grille, en pleine largeur, et la page n'en tient qu'un à la fois — corriger deux
   * pièces en parallèle n'a aucun sens et doublerait les états à suivre.
   */
  const [editing, setEditing] = useState<EditingDocument | null>(null)

  return (
    <div>
      <PrintHeader
        organization={t('brand.name')}
        title={t('vehicle.file.printTitle')}
        reference={vehicle.plate}
        printedOn={formatDate(file.today, locale)}
      />

      {/* --- Identité : la plaque est l'identifiant, en tête et isolée en bidi. --- */}
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border pb-3">
        <Plate value={vehicle.plate} size="lg" />
        <span className="text-base">
          {vehicle.make} {vehicle.model}
          {vehicle.year ? ` ${vehicle.year}` : ''}
        </span>
        {vehicle.fuel ? <span className="text-xs text-muted-foreground">{t(`vehicle.fuel.${vehicle.fuel}`)}</span> : null}
        {vehicle.gearbox ? (
          <span className="text-xs text-muted-foreground">{t(`vehicle.gearbox.${vehicle.gearbox}`)}</span>
        ) : null}
        <span className="ms-auto flex items-center gap-4">
          <Badge variant={STATUS_TONES[vehicle.status] ?? 'neutral'}>
            {t(`vehicle.status.${vehicle.status}`)}
          </Badge>
          <PrintButton label={t('vehicle.file.print')} />
          {/* La correction est à UN clic de la fiche : c'est là qu'on constate
              l'erreur, c'est là qu'on doit pouvoir la reprendre. */}
          <Link
            to="/$lang/app/vehicules/$vehicleId/modifier"
            params={{ lang: locale, vehicleId: vehicle.id }}
            data-print="hide"
            className={buttonVariants({ variant: 'outline' })}
          >
            <span>{t('action.edit')}</span>
          </Link>
          <Link
            to="/$lang/app/vehicules"
            params={{ lang: locale }}
            data-print="hide"
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('vehicle.list.backToList')}</span>
          </Link>
        </span>
      </header>

      {/* --- Relevé : ce qui pilote toutes les échéances d'entretien. --- */}
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border py-3 text-sm">
        <span className="numeric text-base">
          {formatKilometers(vehicle.currentKm, locale)} km
        </span>
        <span className="text-xs text-muted-foreground">
          {vehicle.currentKmAt
            ? `${t('vehicle.file.recordedAt')} ${formatDateTime(vehicle.currentKmAt, locale)}`
            : t('vehicle.file.never')}
        </span>
        {vehicle.dailyCents !== null ? (
          <span className="numeric ms-auto text-xs text-muted-foreground">
            {formatMoney(vehicle.dailyCents, locale)}
          </span>
        ) : null}
      </p>

      {/* --- LE CARNET. --- */}
      <section className="mt-8">
        <h2 className="mb-2 text-lg">{t('vehicle.file.logbook')}</h2>
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
        <h2 className="mb-4 border-b border-border pb-2 text-lg">
          {t('vehicle.file.documents')}
        </h2>
        <ul className="grid gap-px bg-border sm:grid-cols-2">
          <DocumentCard
            icon={<InsuranceShieldIcon size={20} />}
            label={t('deadline.insurance')}
            value={documents.insurance?.company ?? null}
            detail={
              documents.insurance
                ? `${t('vehicle.file.expiresOn')} ${formatDate(documents.insurance.expiresOn, locale)}`
                : null
            }
            editing={
              documents.insurance
                ? {
                    type: 'insurance',
                    id: documents.insurance.id,
                    values: {
                      company: documents.insurance.company,
                      policyNumber: documents.insurance.policyNumber ?? '',
                      startsOn: documents.insurance.startsOn ?? '',
                      expiresOn: documents.insurance.expiresOn,
                      premium: centsToInput(documents.insurance.premiumCents),
                    },
                  }
                : null
            }
            onEdit={setEditing}
          />
          <DocumentCard
            icon={<InspectionBadgeIcon size={20} />}
            label={t('deadline.inspection')}
            value={documents.inspection?.centerName ?? null}
            detail={
              documents.inspection
                ? `${t('vehicle.file.expiresOn')} ${formatDate(documents.inspection.expiresOn, locale)}`
                : null
            }
            editing={
              documents.inspection
                ? {
                    type: 'inspection',
                    id: documents.inspection.id,
                    values: {
                      centerName: documents.inspection.centerName ?? '',
                      certificateNumber: documents.inspection.certificateNumber ?? '',
                      performedOn: documents.inspection.performedOn,
                      expiresOn: documents.inspection.expiresOn,
                      cost: centsToInput(documents.inspection.costCents),
                    },
                  }
                : null
            }
            onEdit={setEditing}
          />
          <DocumentCard
            icon={<RoadTaxStickerIcon size={20} />}
            label={t('deadline.roadTax')}
            value={documents.roadTax ? String(documents.roadTax.year) : null}
            detail={
              documents.roadTax
                ? documents.roadTax.paidAt
                  ? `${t('vehicle.file.paidOn')} ${formatDate(documents.roadTax.paidAt, locale)}`
                  : t('vehicle.file.unpaid')
                : null
            }
            editing={
              documents.roadTax
                ? {
                    type: 'roadTax',
                    id: documents.roadTax.id,
                    values: {
                      year: String(documents.roadTax.year),
                      paidAt: documents.roadTax.paidAt ?? '',
                      amount: centsToInput(documents.roadTax.amountCents),
                      receiptNumber: documents.roadTax.receiptNumber ?? '',
                    },
                  }
                : null
            }
            onEdit={setEditing}
          />
          {/* La carte grise n'expire pas au Maroc : pas de date, pas d'alerte. É1. */}
          <DocumentCard
            icon={<RegistrationCardIcon size={20} />}
            label={t('entity.registration')}
            value={documents.registration?.registrationNumber ?? null}
            detail={null}
            editing={
              documents.registration
                ? {
                    type: 'registration',
                    id: documents.registration.id,
                    values: {
                      registrationNumber: documents.registration.registrationNumber ?? '',
                      firstRegisteredOn: documents.registration.firstRegisteredOn ?? '',
                    },
                  }
                : null
            }
            onEdit={setEditing}
          />
        </ul>

        {/* Le formulaire de correction, en pleine largeur et hors de la grille. */}
        {editing ? (
          <div data-print="hide" className="mt-6 rounded-lg border border-ring bg-card p-4">
            <h3 className="mb-4 text-base">{t('vehicle.file.editDocument')}</h3>
            <DocumentForm
              vehicleId={vehicle.id}
              editing={editing}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : null}

        <div data-print="hide" className="mt-8">
          <h3 className="mb-4 text-base">{t('vehicle.file.addDocument')}</h3>
          <DocumentForm vehicleId={vehicle.id} />
        </div>
      </section>
    </div>
  )
}

/**
 * Une pièce, et ce qu'on peut en faire.
 *
 * « Modifier » et « Supprimer » n'apparaissent QUE si la pièce existe : proposer de
 * supprimer un vide est une case à cocher qui ne fait rien, et ça se remarque.
 *
 * La suppression demande confirmation SUR PLACE plutôt que par un `window.confirm()`.
 * La boîte native ne se traduit pas, ne se style pas, et surtout ne dit pas CE QU'ON
 * supprime — alors qu'ici la question se pose à côté de la pièce concernée, ce qui est
 * la seule façon de ne pas se tromper de ligne.
 */
function DocumentCard({
  icon,
  label,
  value,
  detail,
  editing,
  onEdit,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
  detail: string | null
  /** La pièce existante, prête à corriger. `null` = rien à modifier ni à retirer. */
  editing: EditingDocument | null
  onEdit: (document: EditingDocument) => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function remove(type: DocumentType, id: string) {
    setBusy(true)
    try {
      await deleteDocument({ data: { type, id } })
      setConfirming(false)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex items-start gap-3 bg-background p-4">
      <span className="mt-[2px] text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">{label}</span>
        {value === null ? (
          <span className="mt-1 block text-sm text-warning">{t('vehicle.file.missing')}</span>
        ) : (
          <>
            <span className="mt-1 block text-sm">{value}</span>
            {detail ? <span className="numeric block text-xs text-muted-foreground">{detail}</span> : null}
          </>
        )}

        {editing ? (
          <span data-print="hide" className="mt-2 flex flex-wrap items-center gap-3">
            {confirming ? (
              <>
                <span className="text-2xs text-destructive">{t('vehicle.file.confirmDelete')}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(editing.type, editing.id)}
                  className="text-2xs font-medium text-destructive underline underline-offset-4 disabled:opacity-45"
                >
                  {t('vehicle.file.delete')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-2xs text-muted-foreground underline underline-offset-4"
                >
                  {t('vehicle.file.cancel')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(editing)}
                  className="text-2xs text-primary underline underline-offset-4"
                >
                  {t('vehicle.file.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="text-2xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
                >
                  {t('vehicle.file.delete')}
                </button>
              </>
            )}
          </span>
        ) : null}
      </span>
    </li>
  )
}

export type { VehicleFile }
