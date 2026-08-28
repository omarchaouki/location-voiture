import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { createCustomer } from '~/server/customers'
import { CustomerForm } from '~/ui/customers/customer-form'
import { PageHeader } from '~/ui/primitives/card'
import { buttonVariants } from '~/ui/shadcn/button'

/**
 * Ajout d'un client.
 *
 * L'écran ne dessine plus le formulaire : il vit dans `src/ui/customers/customer-form.tsx`
 * et sert aussi à la CORRECTION. Ce qui reste ici, c'est l'appel serveur et la lecture
 * de son seul refus métier — un client sans identité affichable.
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

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('customer.new')}
        action={
          <Link
            to="/$lang/app/clients"
            params={{ lang: locale }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('customer.back')}</span>
          </Link>
        }
      />

      <CustomerForm
        busy={busy}
        error={error}
        submitLabel={t('customer.submit')}
        onSubmit={(payload) => {
          setBusy(true)
          setError(null)

          void createCustomer({ data: payload })
            .then(async () => {
              await navigate({ to: '/$lang/app/clients', params: { lang: locale } })
            })
            .catch((cause: unknown) => {
              const message = cause instanceof Error ? cause.message : String(cause)
              setError(
                /nameRequired/.test(message)
                  ? t('customer.nameRequired')
                  : t('error.genericTitle'),
              )
              setBusy(false)
            })
        }}
      />
    </div>
  )
}
