import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { normalizePlateInput } from '~/core/plate'
import { FUELS, GEARBOXES, VEHICLE_CATEGORIES } from '~/core/schemas/vehicle'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { createVehicle } from '~/server/vehicles'
import { Button, buttonVariants } from '~/ui/shadcn/button'
import { choiceField, textField } from '~/ui/forms/form-data'

/**
 * Ajout d'un véhicule.
 *
 * La plaque est vérifiée à la saisie ET côté serveur : ici pour éviter un aller-retour
 * inutile, là-bas parce que c'est la seule vérification qui compte.
 */
export const Route = createFileRoute('/$lang/app/vehicules/nouveau')({
  component: NewVehiclePage,
})

/** Champ numérique optionnel : une chaîne vide vaut « non renseigné », pas zéro. */
function optionalNumber(form: FormData, name: string): number | undefined {
  const raw = textField(form, name)
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

/** Montant saisi en dirhams, stocké en centimes. Jamais de flottant en base. */
function optionalCents(form: FormData, name: string): number | undefined {
  const raw = textField(form, name).replace(',', '.')
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined
}

function NewVehiclePage() {
  const { t } = useTranslation()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const plate = textField(form, 'plate')

    if (normalizePlateInput(plate) === null) {
      setError(t('vehicle.form.invalidPlate'))
      return
    }

    setBusy(true)
    setError(null)

    try {
      const created = await createVehicle({
        data: {
          plate,
          make: textField(form, 'make'),
          model: textField(form, 'model'),
          year: optionalNumber(form, 'year'),
          color: textField(form, 'color') || undefined,
          category: choiceField(form, 'category', VEHICLE_CATEGORIES, 'citadine'),
          fuel: choiceField(form, 'fuel', FUELS, 'diesel'),
          gearbox: choiceField(form, 'gearbox', GEARBOXES, 'manuelle'),
          seats: optionalNumber(form, 'seats'),
          vin: textField(form, 'vin') || undefined,
          currentKm: optionalNumber(form, 'currentKm') ?? 0,
          dailyCents: optionalCents(form, 'dailyRate'),
          depositCents: optionalCents(form, 'deposit'),
          notes: textField(form, 'notes') || undefined,
        },
      })
      await navigate({
        to: '/$lang/app/vehicules/$vehicleId',
        params: { lang: locale, vehicleId: created.id },
      })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)

      /*
       * Trois refus possibles, et deux d'entre eux ne sont pas des erreurs.
       *
       * Le doublon de plaque : l'index unique le refuse, et c'est bien lui la vérité,
       * pas la validation du formulaire.
       *
       * Le quota atteint : ce n'est pas une panne, c'est une limite d'offre. Le
       * message dit le nombre atteint et invite à changer d'offre — un « une erreur
       * est survenue » enverrait le client au support au lieu du commercial.
       */
      const quota = /quota (\w+) reached: (\d+)\/(\d+)/.exec(message)
      setError(
        quota
          ? t('billing.quotaReached', { current: quota[2], limit: quota[3] })
          : /unique/i.test(message)
            ? t('vehicle.form.duplicatePlate')
            : t('error.genericTitle'),
      )
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="flex flex-wrap items-baseline gap-x-4 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('vehicle.form.title')}</h1>
        <span className="ms-auto">
          <Link
            to="/$lang/app/vehicules"
            params={{ lang: locale }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('vehicle.list.backToList')}</span>
          </Link>
        </span>
      </header>

      <form method="post" className="mt-8 grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <Text name="plate" label={t('vehicle.form.plate')} hint={t('vehicle.form.plateHint')} required />
        <Text name="vin" label={t('vehicle.form.vin')} />
        <Text name="make" label={t('vehicle.form.make')} required />
        <Text name="model" label={t('vehicle.form.model')} required />
        <Text name="year" label={t('vehicle.form.year')} type="number" />
        <Text name="color" label={t('vehicle.form.color')} />

        <Select
          name="category"
          label={t('vehicle.form.category')}
          options={VEHICLE_CATEGORIES}
          prefix="vehicle.category"
        />
        <Select name="fuel" label={t('vehicle.form.fuel')} options={FUELS} prefix="vehicle.fuel" />
        <Select
          name="gearbox"
          label={t('vehicle.form.gearbox')}
          options={GEARBOXES}
          prefix="vehicle.gearbox"
        />
        <Text name="seats" label={t('vehicle.form.seats')} type="number" />

        <Text name="currentKm" label={t('vehicle.form.currentKm')} type="number" />
        <Text name="dailyRate" label={t('vehicle.form.dailyRate')} type="number" />
        <Text name="deposit" label={t('vehicle.form.deposit')} type="number" />

        <label className="block sm:col-span-2">
          <span className="text-xs text-muted-foreground">{t('vehicle.form.notes')}</span>
          <textarea
            name="notes"
            rows={3}
            className="mt-1 block w-full border border-input bg-card px-3 py-2 text-base"
          />
        </label>

        {error ? (
          <p role="alert" className="border-s-2 border-destructive ps-3 text-sm text-destructive sm:col-span-2">
            {error}
          </p>
        ) : null}

        <div className="sm:col-span-2">
          <Button type="submit" variant="default" disabled={busy}>
            {busy ? t('auth.working') : t('vehicle.form.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Text({
  name,
  label,
  hint,
  type = 'text',
  required,
}: {
  name: string
  label: string
  hint?: string
  type?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        className="numeric mt-1 block w-full border border-input bg-card px-3 py-2 text-base"
        style={{ minHeight: 'var(--tap-target)' }}
      />
      {hint ? <span className="mt-1 block text-2xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

function Select({
  name,
  label,
  options,
  prefix,
}: {
  name: string
  label: string
  options: readonly string[]
  /** Préfixe de clé i18n : les valeurs d'énumération se traduisent aussi. */
  prefix: string
}) {
  const { t } = useTranslation()

  return (
    <label className="block">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        name={name}
        className="mt-1 block w-full border border-input bg-card px-3 py-2 text-base"
        style={{ minHeight: 'var(--tap-target)' }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`${prefix}.${option}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
