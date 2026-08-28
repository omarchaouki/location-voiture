import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { createVehicle } from '~/server/vehicles'
import { PageHeader } from '~/ui/primitives/card'
import { buttonVariants } from '~/ui/shadcn/button'
import { VehicleForm } from '~/ui/vehicles/vehicle-form'

/**
 * Ajout d'un véhicule.
 *
 * L'écran ne dessine plus le formulaire : il vit dans `src/ui/vehicles/vehicle-form.tsx`
 * et sert aussi à la CORRECTION. Ce qui reste ici, c'est ce qui appartient vraiment à
 * la création — l'appel serveur, et la lecture de ses trois refus possibles.
 */
export const Route = createFileRoute('/$lang/app/vehicules/nouveau')({
  component: NewVehiclePage,
})

function NewVehiclePage() {
  const { t } = useTranslation()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('vehicle.form.title')}
        action={
          <Link
            to="/$lang/app/vehicules"
            params={{ lang: locale }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('vehicle.list.backToList')}</span>
          </Link>
        }
      />

      <VehicleForm
        busy={busy}
        error={error}
        submitLabel={t('vehicle.form.submit')}
        onSubmit={(payload, steps) => {
          setBusy(true)
          setError(null)

          void createVehicle({ data: payload })
            .then(async (created) => {
              await navigate({
                to: '/$lang/app/vehicules/$vehicleId',
                params: { lang: locale, vehicleId: created.id },
              })
            })
            .catch((cause: unknown) => {
              const message = cause instanceof Error ? cause.message : String(cause)

              /*
               * Trois refus possibles, et deux d'entre eux ne sont pas des erreurs.
               *
               * Le DOUBLON de plaque : l'index unique le refuse, et c'est bien lui la
               * vérité, pas la validation du formulaire. Il se pose SUR LE CHAMP — la
               * plaque est à l'étape 1, la soumission se fait depuis l'étape 3, et un
               * message en bas de page n'indiquerait rien à corriger.
               *
               * Le QUOTA atteint : ce n'est pas une panne, c'est une limite d'offre. Le
               * message dit le nombre atteint et invite à changer d'offre — un « une
               * erreur est survenue » enverrait le client au support au lieu du
               * commercial.
               */
              const quota = /quota (\w+) reached: (\d+)\/(\d+)/.exec(message)
              if (!quota && /unique/i.test(message)) {
                steps.reportFieldError('plate', t('vehicle.form.duplicatePlate'))
              } else {
                setError(
                  quota
                    ? t('billing.quotaReached', { current: quota[2], limit: quota[3] })
                    : t('error.genericTitle'),
                )
              }
              setBusy(false)
            })
        }}
      />
    </div>
  )
}
