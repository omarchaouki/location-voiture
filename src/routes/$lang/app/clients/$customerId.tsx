import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { getCustomer, updateCustomer } from '~/server/customers'
import { CustomerForm, valuesFromCustomer } from '~/ui/customers/customer-form'
import { PageHeader } from '~/ui/primitives/card'
import { Badge } from '~/ui/shadcn/badge'
import { buttonVariants } from '~/ui/shadcn/button'
import { AlertListSkeleton } from '~/ui/skeletons'

/**
 * CORRECTION D'UN CLIENT.
 *
 * L'écran manquait. `updateCustomer` existait côté serveur mais n'était appelé par
 * personne : un numéro de permis mal tapé, un téléphone changé ou une société
 * enregistrée par erreur en particulier n'avaient aucun chemin de correction, et la
 * seule issue était de créer un second client — donc de couper l'historique des
 * locations en deux.
 *
 * Les champs arrivent REMPLIS, tous, y compris ceux que la liste n'affiche pas.
 */
export const Route = createFileRoute('/$lang/app/clients/$customerId')({
  loader: async ({ params }) => ({
    customer: await getCustomer({ data: { id: params.customerId } }),
  }),
  pendingComponent: AlertListSkeleton,
  component: EditCustomerPage,
})

function EditCustomerPage() {
  const { t } = useTranslation()
  const { customer } = Route.useLoaderData()
  const { lang, customerId } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="max-w-2xl">
      <PageHeader
        title={t('customer.editTitle')}
        meta={
          <>
            <span className="text-sm font-medium">{customer.label}</span>
            <Badge variant="neutral">{t(`customer.kinds.${customer.kind}`)}</Badge>
            {customer.isBlacklisted ? (
              <Badge variant="danger">{t('customer.blacklisted')}</Badge>
            ) : null}
          </>
        }
        action={
          <Link
            to="/$lang/app/clients"
            params={{ lang: locale }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('action.cancel')}</span>
          </Link>
        }
      />

      <CustomerForm
        defaults={valuesFromCustomer({ ...customer, address: customer.address })}
        busy={busy}
        error={error}
        submitLabel={t('customer.saveChanges')}
        onSubmit={(payload) => {
          setBusy(true)
          setError(null)

          void updateCustomer({ data: { id: customerId, ...payload } })
            .then(async () => {
              await navigate({ to: '/$lang/app/clients', params: { lang: locale } })
            })
            .catch((cause: unknown) => {
              const message = cause instanceof Error ? cause.message : String(cause)
              // L'invariant d'identité est vérifié au serveur, sur l'état fusionné :
              // c'est le seul endroit qui connaît les champs non renvoyés.
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
