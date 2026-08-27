import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { CUSTOMER_KINDS, ID_TYPES } from '~/core/schemas/rental'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { createCustomer } from '~/server/customers'
import { Button, buttonVariants } from '~/ui/shadcn/button'
import { CityCombobox } from '~/ui/forms/city-combobox'
import { choiceField, textField } from '~/ui/forms/form-data'
import { Field, FormError, Select, TextArea } from '~/ui/forms/fields'

/**
 * Ajout d'un client.
 *
 * Un seul formulaire pour un particulier et pour une société : le type change ce que
 * le serveur exige, pas l'écran. Un agent ne doit pas choisir un formulaire avant de
 * savoir qui est en face de lui.
 */
export const Route = createFileRoute('/$lang/app/clients/nouveau')({
  component: NewCustomerPage,
})

function NewCustomerPage() {
  const { t } = useTranslation()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)

    try {
      await createCustomer({
        data: {
          kind: choiceField(form, 'kind', CUSTOMER_KINDS, 'individual'),
          firstName: textField(form, 'firstName') || undefined,
          lastName: textField(form, 'lastName') || undefined,
          companyName: textField(form, 'companyName') || undefined,
          idType: choiceField(form, 'idType', ID_TYPES, 'cin'),
          idNumber: textField(form, 'idNumber') || undefined,
          licenceNumber: textField(form, 'licenceNumber') || undefined,
          licenceExpiresOn: textField(form, 'licenceExpiresOn') || undefined,
          licenceCountry: 'MA',
          phone: textField(form, 'phone') || undefined,
          email: textField(form, 'email') || undefined,
          address: textField(form, 'address') || undefined,
          city: textField(form, 'city') || undefined,
          notes: textField(form, 'notes') || undefined,
        },
      })
      await navigate({ to: '/$lang/app/clients', params: { lang: locale } })
    } catch (cause) {
      setError(
        cause instanceof Error && /nameRequired/.test(cause.message)
          ? t('customer.nameRequired')
          : t('error.genericTitle'),
      )
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="flex flex-wrap items-baseline gap-x-4 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('customer.new')}</h1>
        <span className="ms-auto">
          <Link
            to="/$lang/app/clients"
            params={{ lang: locale }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('customer.back')}</span>
          </Link>
        </span>
      </header>

      <form method="post" className="mt-8 grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <Select
          name="kind"
          label={t('customer.kind')}
          options={CUSTOMER_KINDS}
          prefix="customer.kinds"
        />
        <Field name="companyName" label={t('customer.companyName')} numeric={false} />
        <Field name="firstName" label={t('customer.firstName')} numeric={false} />
        <Field name="lastName" label={t('customer.lastName')} numeric={false} />

        <Select
          name="idType"
          label={t('customer.idType')}
          options={ID_TYPES}
          prefix="customer.idTypes"
        />
        <Field name="idNumber" label={t('customer.idNumber')} />

        <Field name="licenceNumber" label={t('customer.licenceNumber')} />
        {/* Le champ qui décide si un contrat pourra être signé. */}
        <Field name="licenceExpiresOn" label={t('customer.licenceExpiresOn')} type="date" />

        <Field name="phone" label={t('customer.phone')} type="tel" />
        <Field name="email" label={t('customer.email')} type="email" numeric={false} />
        <CityCombobox name="city" label={t('customer.city')} />
        <Field name="address" label={t('customer.address')} numeric={false} />

        <TextArea name="notes" label={t('customer.notes')} />

        {error ? <FormError>{error}</FormError> : null}

        <div className="sm:col-span-2">
          <Button type="submit" variant="default" disabled={busy}>
            {busy ? t('auth.working') : t('customer.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}
