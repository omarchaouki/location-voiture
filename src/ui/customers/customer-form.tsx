import { useTranslation } from 'react-i18next'

import { CUSTOMER_KINDS, ID_TYPES } from '~/core/schemas/rental'
import { CityCombobox } from '~/ui/forms/city-combobox'
import { Field, FormError, Select, TextArea } from '~/ui/forms/fields'
import { choiceField, textField } from '~/ui/forms/form-data'
import { StepNav, StepPane, StepProgress, useFormSteps, type FormSteps } from '~/ui/forms/steps'

/**
 * LE FORMULAIRE CLIENT — un seul, pour la création ET la modification.
 *
 * Même raison que pour le véhicule : l'écran de correction n'existait pas, et le
 * dupliquer aurait produit deux listes de champs qui divergent. Un numéro de permis
 * mal tapé condamnait le client à être ressaisi en entier.
 *
 * **Les champs arrivent remplis en correction.** C'est la demande explicite du
 * propriétaire du produit, et ce n'est pas du confort : un formulaire d'édition qui
 * démarre vide n'est pas une correction, c'est une ressaisie — et la ressaisie perd
 * les champs qu'on ne pense pas à retaper.
 */

export interface CustomerFormValues {
  kind: string
  firstName: string
  lastName: string
  companyName: string
  idType: string
  idNumber: string
  licenceNumber: string
  licenceExpiresOn: string
  phone: string
  email: string
  city: string
  address: string
  notes: string
}

/**
 * Les champs facultatifs portent `| undefined` EXPLICITEMENT.
 *
 * Le projet compile avec `exactOptionalPropertyTypes` : sans cela, `?: string` refuse
 * qu'on lui passe `undefined`, et il faudrait construire l'objet par accumulation
 * conditionnelle. Un champ vide vaut « non renseigné », et c'est bien `undefined`
 * qu'on veut transmettre — jamais une chaîne vide, qui s'écrirait telle quelle en base.
 */
export interface CustomerPayload {
  kind: (typeof CUSTOMER_KINDS)[number]
  firstName?: string | undefined
  lastName?: string | undefined
  companyName?: string | undefined
  idType?: (typeof ID_TYPES)[number] | undefined
  idNumber?: string | undefined
  licenceNumber?: string | undefined
  licenceExpiresOn?: string | undefined
  phone?: string | undefined
  email?: string | undefined
  city?: string | undefined
  address?: string | undefined
  notes?: string | undefined
}

const EMPTY: CustomerFormValues = {
  kind: 'individual',
  firstName: '',
  lastName: '',
  companyName: '',
  idType: 'cin',
  idNumber: '',
  licenceNumber: '',
  licenceExpiresOn: '',
  phone: '',
  email: '',
  city: '',
  address: '',
  notes: '',
}

/** La fiche telle qu'elle sort de la base → les valeurs des champs. */
export function valuesFromCustomer(customer: {
  kind: string
  firstName: string | null
  lastName: string | null
  companyName: string | null
  idType: string | null
  idNumber: string | null
  licenceNumber: string | null
  licenceExpiresOn: string | null
  phone: string | null
  email: string | null
  city: string | null
  address: string | null
  notes: string | null
}): CustomerFormValues {
  return {
    kind: customer.kind,
    firstName: customer.firstName ?? '',
    lastName: customer.lastName ?? '',
    companyName: customer.companyName ?? '',
    idType: customer.idType ?? EMPTY.idType,
    idNumber: customer.idNumber ?? '',
    licenceNumber: customer.licenceNumber ?? '',
    licenceExpiresOn: customer.licenceExpiresOn ?? '',
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    city: customer.city ?? '',
    address: customer.address ?? '',
    notes: customer.notes ?? '',
  }
}

/** Chaîne vide = « non renseigné », jamais une chaîne vide en base. */
function optional(form: FormData, name: string): string | undefined {
  return textField(form, name) || undefined
}

export function CustomerForm({
  defaults,
  submitLabel,
  busy,
  error,
  onSubmit,
}: {
  defaults?: CustomerFormValues
  submitLabel: string
  busy: boolean
  error: string | null
  onSubmit: (payload: CustomerPayload, steps: FormSteps) => void
}) {
  const { t } = useTranslation()
  const values = defaults ?? EMPTY

  /*
   * TROIS ÉTAPES, dans l'ordre où les papiers arrivent sur le comptoir : qui est-ce,
   * quels documents, comment le joindre. C'est la séquence réelle d'un départ de
   * location — le client tend sa carte d'identité et son permis avant de donner son
   * adresse, et jamais l'inverse.
   */
  const steps = useFormSteps(3)
  const stepLabels = [
    t('customer.stepIdentity'),
    t('customer.stepDocuments'),
    t('customer.stepContact'),
  ]

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    onSubmit(
      {
        kind: choiceField(form, 'kind', CUSTOMER_KINDS, 'individual'),
        firstName: optional(form, 'firstName'),
        lastName: optional(form, 'lastName'),
        companyName: optional(form, 'companyName'),
        idType: choiceField(form, 'idType', ID_TYPES, 'cin'),
        idNumber: optional(form, 'idNumber'),
        licenceNumber: optional(form, 'licenceNumber'),
        licenceExpiresOn: optional(form, 'licenceExpiresOn'),
        phone: optional(form, 'phone'),
        email: optional(form, 'email'),
        city: optional(form, 'city'),
        address: optional(form, 'address'),
        notes: optional(form, 'notes'),
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

      {/* --- 1. Qui est-ce ---------------------------------------------- */}
      <StepPane index={0} current={steps.index}>
        <Select
          name="kind"
          label={t('customer.kind')}
          options={CUSTOMER_KINDS}
          prefix="customer.kinds"
          defaultValue={values.kind}
          className="sm:col-span-2"
        />
        <Field
          name="firstName"
          label={t('customer.firstName')}
          numeric={false}
          autoComplete="given-name"
          defaultValue={values.firstName}
        />
        <Field
          name="lastName"
          label={t('customer.lastName')}
          numeric={false}
          autoComplete="family-name"
          defaultValue={values.lastName}
        />
        <Field
          name="companyName"
          label={t('customer.companyName')}
          numeric={false}
          autoComplete="organization"
          defaultValue={values.companyName}
          className="sm:col-span-2"
        />
      </StepPane>

      {/* --- 2. Les papiers --------------------------------------------- */}
      <StepPane index={1} current={steps.index}>
        <Select
          name="idType"
          label={t('customer.idType')}
          options={ID_TYPES}
          prefix="customer.idTypes"
          defaultValue={values.idType}
        />
        <Field name="idNumber" label={t('customer.idNumber')} defaultValue={values.idNumber} />
        <Field
          name="licenceNumber"
          label={t('customer.licenceNumber')}
          defaultValue={values.licenceNumber}
        />
        {/* Le champ qui décide si un contrat pourra être signé. */}
        <Field
          name="licenceExpiresOn"
          label={t('customer.licenceExpiresOn')}
          type="date"
          defaultValue={values.licenceExpiresOn}
        />
      </StepPane>

      {/* --- 3. Comment le joindre -------------------------------------- */}
      <StepPane index={2} current={steps.index}>
        <Field
          name="phone"
          label={t('customer.phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={values.phone}
        />
        <Field
          name="email"
          label={t('customer.email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          numeric={false}
          defaultValue={values.email}
        />
        <CityCombobox name="city" label={t('customer.city')} defaultValue={values.city} />
        <Field
          name="address"
          label={t('customer.address')}
          numeric={false}
          defaultValue={values.address}
        />
        <TextArea name="notes" label={t('customer.notes')} defaultValue={values.notes} />
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
