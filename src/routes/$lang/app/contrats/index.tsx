import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatDate, formatMoney } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { listContracts } from '~/server/contracts'
import { EmptyState } from '~/ui/feedback/states'
import { ChevronEndIcon } from '~/ui/icons'
import { BUTTON_STYLE, buttonClasses } from '~/ui/primitives/button'
import { Stamp, type StampTone } from '~/ui/primitives/stamp'
import { AlertListSkeleton } from '~/ui/skeletons'

/**
 * Liste des contrats — un registre à souches.
 *
 * La marge porte la RÉFÉRENCE, comme sur un carnet papier : c'est elle qu'on cite au
 * téléphone, pas le nom du client.
 */
export const Route = createFileRoute('/$lang/app/contrats/')({
  loader: async () => ({ contracts: await listContracts() }),
  pendingComponent: AlertListSkeleton,
  component: ContractsPage,
})

const STATUS_TONES: Record<string, StampTone> = {
  reservation: 'neutral',
  active: 'accent',
  returned: 'calm',
  late: 'danger',
  cancelled: 'neutral',
}

function ContractsPage() {
  const { t } = useTranslation()
  const { contracts } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  return (
    <div>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-rule-strong pb-3">
        <h1 className="font-display text-2xl">{t('contract.title')}</h1>
        <span className="numeric text-xs text-muted">{contracts.length}</span>
        <span className="ms-auto">
          <Link
            to="/$lang/app/contrats/nouveau"
            params={{ lang: locale }}
            className={buttonClasses('primary')}
            style={BUTTON_STYLE}
          >
            <span>{t('contract.add')}</span>
          </Link>
        </span>
      </header>

      {contracts.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t('contract.empty')} body={t('contract.emptyBody')} />
        </div>
      ) : (
        <ul className="mt-6 border-t border-rule">
          {contracts.map((contract) => (
            <li key={contract.id} className="border-b border-rule">
              <Link
                to="/$lang/app/contrats/$contractId"
                params={{ lang: locale, contractId: contract.id }}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-sunken"
                style={{ minHeight: 'var(--row-height-dense)' }}
              >
                <span className="ledger-margin numeric w-32 shrink-0 pe-4">
                  {contract.reference}
                </span>
                <span className="font-medium">{contract.customerLabel}</span>
                <span className="text-xs text-muted">{contract.vehicleLabel}</span>

                <span className="ms-auto flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="numeric text-xs text-muted">
                    {formatDate(contract.plannedStartAt.slice(0, 10), locale)} →{' '}
                    {formatDate(contract.plannedEndAt.slice(0, 10), locale)}
                  </span>
                  <span className="numeric text-xs">
                    {formatMoney(contract.totalCents, locale, 'MAD', { withDecimals: false })}
                  </span>
                  <Stamp tone={STATUS_TONES[contract.status] ?? 'neutral'}>
                    {t(`contract.statuses.${contract.status}`)}
                  </Stamp>
                  <ChevronEndIcon size={16} className="text-muted" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
