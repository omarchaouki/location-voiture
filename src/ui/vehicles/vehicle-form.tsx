import { useTranslation } from 'react-i18next'

import { normalizePlateInput } from '~/core/plate'
import {
  FUELS,
  GEARBOXES,
  VEHICLE_CATEGORIES,
  VEHICLE_STATUSES,
  type CreateVehicleData,
} from '~/core/schemas/vehicle'
import { Field, FormError, Select, TextArea } from '~/ui/forms/fields'
import { choiceField, textField } from '~/ui/forms/form-data'
import { StepNav, StepPane, StepProgress, useFormSteps, type FormSteps } from '~/ui/forms/steps'

/**
 * LE FORMULAIRE VÉHICULE — un seul, pour la création ET la modification.
 *
 * Il était écrit en entier dans l'écran de création, et l'écran de modification
 * n'existait pas : une plaque tapée de travers, une couleur oubliée ou un tarif changé
 * ne se corrigeaient nulle part. Ajouter un second formulaire aurait dupliqué quatorze
 * champs, leurs bornes, leurs conversions de centimes et leur découpage en étapes ; le
 * jour où une borne bouge, c'est toujours la CORRECTION qui reste en arrière — le
 * chemin qu'on regarde le moins.
 *
 * Un seul composant, donc, et deux appelants. La différence tient en deux props :
 * `defaults` (les valeurs venues de la base) et `withStatus` (l'état opérationnel, qui
 * n'a pas de sens à la création — une voiture qu'on saisit est disponible).
 */

/**
 * Les valeurs telles qu'elles entrent dans les champs : des CHAÎNES.
 *
 * C'est délibéré et c'est le cœur du sujet. Un `<input>` ne connaît que du texte ;
 * lui passer un `number | null` oblige chaque champ à décider seul ce que vaut `null`,
 * et l'un d'eux finit toujours par afficher « 0 » là où la base dit « non renseigné ».
 * La conversion se fait ICI, une fois, dans `valuesFromVehicle`.
 */
export interface VehicleFormValues {
  plate: string
  make: string
  model: string
  year: string
  color: string
  category: string
  fuel: string
  gearbox: string
  seats: string
  vin: string
  currentKm: string
  dailyRate: string
  deposit: string
  notes: string
  status: string
}

/**
 * Ce que le formulaire rend à l'appelant, déjà typé et en centimes.
 *
 * Le statut est TYPÉ par l'énumération, pas par `string`.
 *
 * `choiceField` rend déjà la valeur restreinte ; la déclarer `string` ici la
 * relâcherait juste avant `updateVehicle`, dont le schéma Zod attend l'union — et le
 * refus n'apparaîtrait qu'à l'exécution, sur un formulaire soumis.
 */
export type VehiclePayload = Omit<CreateVehicleData, 'branchId'> & {
  status?: (typeof VEHICLE_STATUSES)[number]
}

const EMPTY: VehicleFormValues = {
  plate: '',
  make: '',
  model: '',
  year: '',
  color: '',
  category: 'citadine',
  fuel: 'diesel',
  gearbox: 'manuelle',
  seats: '',
  vin: '',
  currentKm: '',
  dailyRate: '',
  deposit: '',
  notes: '',
  status: 'available',
}

/** Centimes → champ en dirhams. `String()` donne la forme la plus courte exacte. */
function centsToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value / 100)
}

function numberToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * La fiche telle qu'elle sort de la base → les valeurs des champs.
 *
 * Tout passe par ici, y compris les champs vides : un champ absent du modèle de
 * lecture reviendrait VIDE à l'écran et serait effacé en base à la première correction
 * d'un champ voisin. C'est le défaut classique d'un formulaire d'édition alimenté par
 * une vue partielle, et il ne se voit qu'après coup.
 */
export function valuesFromVehicle(vehicle: {
  plate: string
  make: string
  model: string
  year: number | null
  color: string | null
  category: string | null
  fuel: string | null
  gearbox: string | null
  seats: number | null
  vin: string | null
  currentKm: number
  dailyCents: number | null
  depositCents: number | null
  notes: string | null
  status: string
}): VehicleFormValues {
  return {
    plate: vehicle.plate,
    make: vehicle.make,
    model: vehicle.model,
    year: numberToInput(vehicle.year),
    color: vehicle.color ?? '',
    category: vehicle.category ?? EMPTY.category,
    fuel: vehicle.fuel ?? EMPTY.fuel,
    gearbox: vehicle.gearbox ?? EMPTY.gearbox,
    seats: numberToInput(vehicle.seats),
    vin: vehicle.vin ?? '',
    currentKm: numberToInput(vehicle.currentKm),
    dailyRate: centsToInput(vehicle.dailyCents),
    deposit: centsToInput(vehicle.depositCents),
    notes: vehicle.notes ?? '',
    status: vehicle.status,
  }
}

/** Champ numérique facultatif : une chaîne vide vaut « non renseigné », pas zéro. */
function optionalNumber(form: FormData, name: string): number | undefined {
  const raw = textField(form, name)
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

/** Montant saisi en dirhams, rendu en centimes. Jamais de flottant en base. */
function optionalCents(form: FormData, name: string): number | undefined {
  const raw = textField(form, name).replace(',', '.')
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined
}

export function VehicleForm({
  defaults,
  submitLabel,
  busy,
  error,
  withStatus = false,
  onSubmit,
}: {
  /** Absent = création. Présent = correction, champs pré-remplis depuis la base. */
  defaults?: VehicleFormValues
  submitLabel: string
  busy: boolean
  error: string | null
  /** L'état opérationnel n'a de sens qu'en correction. */
  withStatus?: boolean
  /**
   * `steps` est passé à l'appelant pour qu'il puisse poser un refus SUR LE CHAMP —
   * une plaque en double n'est connue qu'après le retour du serveur, et un message en
   * bas de page à trois étapes du champ concerné n'indique rien à corriger.
   */
  onSubmit: (payload: VehiclePayload, steps: FormSteps) => void
}) {
  const { t } = useTranslation()
  const values = defaults ?? EMPTY

  /*
   * TROIS ÉTAPES, et le découpage suit l'ordre dans lequel on a les informations sous
   * la main : la carte grise donne la première en entier, les caractéristiques se
   * lisent sur la voiture, les tarifs sont une décision commerciale prise après.
   */
  const steps = useFormSteps(3)
  const stepLabels = [
    t('vehicle.form.stepIdentity'),
    t('vehicle.form.stepSpecs'),
    t('vehicle.form.stepPricing'),
  ]
  const currentYear = new Date().getFullYear()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const plate = textField(form, 'plate')

    // La plaque est vérifiée ICI pour éviter un aller-retour, et côté serveur parce
    // que c'est la seule vérification qui compte.
    if (normalizePlateInput(plate) === null) {
      steps.reportFieldError('plate', t('vehicle.form.invalidPlate'))
      return
    }

    onSubmit(
      {
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
        ...(withStatus
          ? { status: choiceField(form, 'status', VEHICLE_STATUSES, 'available') }
          : {}),
      },
      steps,
    )
  }

  return (
    <form
      method="post"
      {...steps.formProps}
      className="mt-8 grid gap-6"
      onSubmit={steps.handleSubmit(submit)}
    >
      <StepProgress
        labels={stepLabels}
        current={steps.index}
        onGoTo={steps.goTo}
        liveLabel={t('form.stepLive', {
          current: steps.index + 1,
          total: stepLabels.length,
          label: stepLabels[steps.index] ?? '',
        })}
      />

      {/* --- 1. Ce qui est écrit sur la carte grise -------------------- */}
      <StepPane index={0} current={steps.index}>
        <Field
          name="plate"
          label={t('vehicle.form.plate')}
          hint={t('vehicle.form.plateHint')}
          required
          autoCapitalize="characters"
          defaultValue={values.plate}
          className="sm:col-span-2"
        />
        {withStatus ? (
          <Select
            name="status"
            label={t('vehicle.form.status')}
            options={VEHICLE_STATUSES}
            prefix="vehicle.status"
            defaultValue={values.status}
            className="sm:col-span-2"
          />
        ) : null}
        <Field
          name="make"
          label={t('vehicle.form.make')}
          numeric={false}
          required
          defaultValue={values.make}
        />
        <Field
          name="model"
          label={t('vehicle.form.model')}
          numeric={false}
          required
          defaultValue={values.model}
        />
        {/*
          Bornes RÉELLES plutôt qu'un champ numérique nu : une voiture de location
          n'est pas de 1912, et « 20256 » tapé de travers doit être refusé à la saisie,
          pas découvert dans un tableau six mois plus tard.
        */}
        <Field
          name="year"
          label={t('vehicle.form.year')}
          type="number"
          inputMode="numeric"
          min={1980}
          max={currentYear + 1}
          defaultValue={values.year}
        />
        <Field
          name="color"
          label={t('vehicle.form.color')}
          numeric={false}
          defaultValue={values.color}
        />
        <Field
          name="vin"
          label={t('vehicle.form.vin')}
          defaultValue={values.vin}
          className="sm:col-span-2"
        />
      </StepPane>

      {/* --- 2. Ce qui se lit sur la voiture --------------------------- */}
      <StepPane index={1} current={steps.index}>
        <Select
          name="category"
          label={t('vehicle.form.category')}
          options={VEHICLE_CATEGORIES}
          prefix="vehicle.category"
          defaultValue={values.category}
        />
        <Select
          name="fuel"
          label={t('vehicle.form.fuel')}
          options={FUELS}
          prefix="vehicle.fuel"
          defaultValue={values.fuel}
        />
        <Select
          name="gearbox"
          label={t('vehicle.form.gearbox')}
          options={GEARBOXES}
          prefix="vehicle.gearbox"
          defaultValue={values.gearbox}
        />
        <Field
          name="seats"
          label={t('vehicle.form.seats')}
          type="number"
          inputMode="numeric"
          min={1}
          max={9}
          defaultValue={values.seats}
        />
        <Field
          name="currentKm"
          label={t('vehicle.form.currentKm')}
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={values.currentKm}
          className="sm:col-span-2"
        />
      </StepPane>

      {/* --- 3. Ce qui se décide ---------------------------------------- */}
      <StepPane index={2} current={steps.index}>
        {/*
          `step` au centime, et ce n'est pas un détail de confort : sans lui un champ
          numérique vaut `step=1`, et le navigateur REFUSE « 250,50 » sans que rien
          n'explique pourquoi le formulaire ne part pas.
        */}
        <Field
          name="dailyRate"
          label={t('vehicle.form.dailyRate')}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          defaultValue={values.dailyRate}
        />
        <Field
          name="deposit"
          label={t('vehicle.form.deposit')}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          defaultValue={values.deposit}
        />
        <TextArea name="notes" label={t('vehicle.form.notes')} defaultValue={values.notes} />
      </StepPane>

      {error ? <FormError>{error}</FormError> : null}

      <StepNav
        steps={steps}
        busy={busy}
        backLabel={t('form.stepBack')}
        nextLabel={t('form.stepNext')}
        submitLabel={busy ? t('auth.working') : submitLabel}
      />
    </form>
  )
}
