import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { civilDaysBetween } from '~/core/dates'
import { businessCivilDate, formatDate } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { listCustomers } from '~/server/customers'
import { buttonVariants } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { Badge } from '~/ui/shadcn/badge'
import { AlertListSkeleton } from '~/ui/skeletons'

/**
 * Liste des clients.
 *
 * La colonne qui compte n'est pas le nom mais la validité du PERMIS : c'est elle qui
 * bloquera une signature au comptoir. Elle est donc marquée, pas rangée en dernier.
 */
export const Route = createFileRoute('/$lang/app/clients/')({
  loader: async () => ({
    customers: await listCustomers(),
    today: businessCivilDate(new Date()),
  }),
  pendingComponent: AlertListSkeleton,
  component: CustomersPage,
})

function CustomersPage() {
  const { t } = useTranslation()
  const { customers, today } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  return (
    <div>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-rule-strong pb-3">
        <h1 className="font-display text-2xl">{t('customer.title')}</h1>
        <span className="numeric text-xs text-muted">{customers.length}</span>
        <span className="ms-auto">
          <Link
            to="/$lang/app/clients/nouveau"
            params={{ lang: locale }}
            className={buttonVariants()}
          >
            <span>{t('customer.add')}</span>
          </Link>
        </span>
      </header>

      {customers.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t('customer.empty')} body={t('customer.emptyBody')} />
        </div>
      ) : (
        <ul className="mt-6 border-t border-rule">
          {customers.map((customer) => {
            const expired =
              customer.licenceExpiresOn !== null &&
              civilDaysBetween(today, customer.licenceExpiresOn) < 0

            return (
              <li
                key={customer.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-rule px-4 py-3"
                style={{ minHeight: 'var(--row-height-dense)' }}
              >
                <span className="ledger-margin w-28 sm:w-40 shrink-0 pe-4 font-medium">
                  {customer.label}
                </span>
                <span className="text-xs text-muted">{t(`customer.kinds.${customer.kind}`)}</span>
                {customer.phone ? (
                  <span className="numeric text-xs text-muted">{customer.phone}</span>
                ) : null}
                {customer.city ? (
                  <span className="text-xs text-muted">{customer.city}</span>
                ) : null}

                <span className="ms-auto flex flex-wrap items-center gap-3">
                  {customer.isBlacklisted ? (
                    <Badge variant="danger">{t('customer.blacklisted')}</Badge>
                  ) : null}
                  {customer.licenceExpiresOn === null ? (
                    <Badge variant="warn">{t('customer.licenceMissing')}</Badge>
                  ) : expired ? (
                    <Badge variant="danger">{t('customer.licenceExpired')}</Badge>
                  ) : (
                    <span className="numeric text-xs text-muted">
                      {formatDate(customer.licenceExpiresOn, locale)}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
