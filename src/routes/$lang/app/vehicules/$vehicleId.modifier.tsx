import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { getVehicleFile, updateVehicle } from '~/server/vehicles'
import { Plate } from '~/ui/primitives/plate'
import { PageHeader } from '~/ui/primitives/card'
import { buttonVariants } from '~/ui/shadcn/button'
import { VehicleFileSkeleton } from '~/ui/skeletons'
import { VehicleForm, valuesFromVehicle } from '~/ui/vehicles/vehicle-form'

/**
 * CORRECTION D'UN VÉHICULE.
 *
 * L'écran manquait, et c'est le manque le plus visible du produit : une plaque tapée
 * de travers, une couleur oubliée, un tarif renégocié ou une voiture qui part à
 * l'atelier n'avaient aucun chemin de correction. `updateVehicle` existait pourtant
 * côté serveur depuis la Phase 3 — il n'était appelé par personne.
 *
 * **Les champs arrivent remplis**, et pas seulement ceux qu'on affiche : la fiche
 * complète est chargée puis convertie une fois par `valuesFromVehicle`. Un formulaire
 * d'édition alimenté par une vue partielle renvoie du vide dans les champs qu'il ne
 * connaît pas, et les efface en base à la première correction d'un champ voisin.
 */
export const Route = createFileRoute('/$lang/app/vehicules/$vehicleId/modifier')({
  loader: async ({ params }) => ({
    file: await getVehicleFile({ data: { id: params.vehicleId } }),
  }),
  pendingComponent: VehicleFileSkeleton,
  component: EditVehiclePage,
})

function EditVehiclePage() {
  const { t } = useTranslation()
  const { file } = Route.useLoaderData()
  const { lang, vehicleId } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const vehicle = file.vehicle

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('vehicle.form.editTitle')}
        meta={
          <>
            <Plate value={vehicle.plate} />
            <span className="text-sm text-muted-foreground">
              {vehicle.make} {vehicle.model}
            </span>
          </>
        }
        action={
          <Link
            to="/$lang/app/vehicules/$vehicleId"
            params={{ lang: locale, vehicleId }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('action.cancel')}</span>
          </Link>
        }
      />

      <VehicleForm
        withStatus
        defaults={valuesFromVehicle(vehicle)}
        busy={busy}
        error={error}
        submitLabel={t('vehicle.form.saveChanges')}
        onSubmit={(payload, steps) => {
          setBusy(true)
          setError(null)

          void updateVehicle({ data: { id: vehicleId, ...payload } })
            .then(async () => {
              await navigate({
                to: '/$lang/app/vehicules/$vehicleId',
                params: { lang: locale, vehicleId },
              })
            })
            .catch((cause: unknown) => {
              const message = cause instanceof Error ? cause.message : String(cause)
              // Le doublon de plaque est un refus DE CHAMP, comme à la création.
              if (/unique/i.test(message)) {
                steps.reportFieldError('plate', t('vehicle.form.duplicatePlate'))
              } else {
                setError(t('error.genericTitle'))
              }
              setBusy(false)
            })
        }}
      />
    </div>
  )
}
