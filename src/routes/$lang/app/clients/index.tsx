import { createFileRoute, Link } from '@tanstack/react-router'

import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { civilDaysBetween } from '~/core/dates'
import { businessCivilDate, formatDate, formatMoney } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { listCustomers, loadCustomersLedger, type CustomerLedger } from '~/server/customers'
import { buttonVariants } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { Badge } from '~/ui/shadcn/badge'
import { AlertListSkeleton } from '~/ui/skeletons'
import { cn } from '~/ui/shadcn/utils'

/**
 * Liste des clients — et, depuis le 28/08/2026, l'état des encaissements.
 *
 * La colonne qui compte au COMPTOIR n'est pas le nom mais la validité du PERMIS :
 * c'est elle qui bloquera une signature. Elle est donc marquée, pas rangée en dernier.
 *
 * **Ce qui compte au BUREAU est autre chose : qui n'a pas payé.** Ce chiffre existait,
 * éparpillé entre un statut par contrat et des encaissements dans une autre table, et
 * se reconstituait à la main dans un carnet posé à côté du clavier. Trois tuiles le
 * disent maintenant, et celle des impayés est CLIQUABLE — parce qu'un total d'impayés
 * qu'on ne peut pas ouvrir ne sert qu'à inquiéter. Elle bascule la liste sur les seuls
 * clients débiteurs, numéro de téléphone en évidence, dans l'ordre des montants dus :
 * c'est l'ordre dans lequel on passe ses appels.
 *
 * L'onglet ouvert vit dans l'ADRESSE (`?vue=impayes`) et non dans un état React : une
 * relance se partage, et un lien qui ramène sur la liste complète n'aide personne.
 */
export const Route = createFileRoute('/$lang/app/clients/')({
  validateSearch: z.object({ vue: z.enum(['tous', 'impayes']).optional() }),
  loader: async () => ({
    customers: await listCustomers(),
    ledger: await loadCustomersLedger(),
    today: businessCivilDate(new Date()),
  }),
  pendingComponent: AlertListSkeleton,
  component: CustomersPage,
})

function CustomersPage() {
  const { t } = useTranslation()
  const { customers, ledger, today } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const { vue } = Route.useSearch()
  const showingDebtors = vue === 'impayes'

  return (
    <div>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('customer.title')}</h1>
        <span className="numeric text-xs text-muted-foreground">{customers.length}</span>
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

      {/*
        LES TROIS TUILES.

        Encaissé et reste dû sont les deux faces d'un même total facturé, et c'est
        pourquoi le facturé est montré aussi : deux nombres sans leur somme obligent à
        l'addition mentale, et une addition mentale sur des dirhams se trompe.

        La tuile des impayés est un LIEN, les deux autres non. Ce n'est pas une
        omission : « voir les clients qui ont payé » n'est le début d'aucune action.
      */}
      <div className="mt-6 grid gap-px bg-border sm:grid-cols-3">
        <LedgerTile
          label={t('customer.ledger.billed')}
          amount={formatMoney(ledger.billedCents, locale, 'MAD', { withDecimals: false })}
          detail={t('customer.ledger.customers', {
            count: ledger.payingCustomers + ledger.outstandingCustomers,
          })}
        />
        <LedgerTile
          label={t('customer.ledger.paid')}
          amount={formatMoney(ledger.paidCents, locale, 'MAD', { withDecimals: false })}
          detail={t('customer.ledger.customers', { count: ledger.payingCustomers })}
          tone="success"
        />
        <LedgerTile
          label={t('customer.ledger.outstanding')}
          amount={formatMoney(ledger.outstandingCents, locale, 'MAD', { withDecimals: false })}
          detail={t('customer.ledger.customers', { count: ledger.outstandingCustomers })}
          {...(ledger.outstandingCents > 0 ? { tone: 'warning' as const } : {})}
          to={showingDebtors ? 'tous' : 'impayes'}
          locale={locale}
          active={showingDebtors}
          actionLabel={
            showingDebtors ? t('customer.ledger.seeAll') : t('customer.ledger.seeDebtors')
          }
        />
      </div>

      {showingDebtors ? (
        <DebtorList rows={ledger.rows.filter((row) => row.balanceCents > 0)} locale={locale} />
      ) : customers.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t('customer.empty')} body={t('customer.emptyBody')} />
        </div>
      ) : (
        <ul className="mt-6 border-t border-border">
          {customers.map((customer) => {
            const expired =
              customer.licenceExpiresOn !== null &&
              civilDaysBetween(today, customer.licenceExpiresOn) < 0

            return (
              <li
                key={customer.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3"
                style={{ minHeight: 'var(--row-height-dense)' }}
              >
                {/* Le NOM est le lien : c'est ce qu'on vise pour ouvrir une fiche,
                    et une colonne d'actions en bout de ligne se perd sur téléphone. */}
                <Link
                  to="/$lang/app/clients/$customerId"
                  params={{ lang: locale, customerId: customer.id }}
                  className="ledger-margin w-28 shrink-0 pe-4 font-medium text-primary underline-offset-4 hover:underline sm:w-40"
                >
                  {customer.label}
                </Link>
                <span className="text-xs text-muted-foreground">{t(`customer.kinds.${customer.kind}`)}</span>
                {customer.phone ? (
                  <span className="numeric text-xs text-muted-foreground">{customer.phone}</span>
                ) : null}
                {customer.city ? (
                  <span className="text-xs text-muted-foreground">{customer.city}</span>
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
                    <span className="numeric text-xs text-muted-foreground">
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

/**
 * Une tuile de comptes.
 *
 * Cliquable ou non selon qu'il y ait quelque chose à ouvrir derrière — et non selon
 * l'esthétique. Une tuile qui a l'air d'un bouton sans en être un se clique quand
 * même, deux fois, avant qu'on renonce.
 */
function LedgerTile({
  label,
  amount,
  detail,
  tone,
  to,
  locale,
  active,
  actionLabel,
}: {
  label: string
  amount: string
  detail: string
  tone?: 'success' | 'warning'
  /** Valeur du paramètre `vue` à poser. Absente = tuile non cliquable. */
  to?: 'tous' | 'impayes'
  locale?: Locale
  active?: boolean
  actionLabel?: string
}) {
  const body = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'numeric text-2xl',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
        )}
      >
        {amount}
      </span>
      <span className="text-2xs text-muted-foreground">{detail}</span>
      {actionLabel === undefined ? null : (
        <span className="text-xs font-medium text-primary underline-offset-4 group-hover:underline">
          {actionLabel}
        </span>
      )}
    </>
  )

  if (to === undefined || locale === undefined) {
    return <div className="grid gap-1 bg-card p-4">{body}</div>
  }

  return (
    <Link
      to="/$lang/app/clients"
      params={{ lang: locale }}
      search={{ vue: to }}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group grid gap-1 bg-card p-4 transition-colors hover:bg-muted',
        active && 'bg-muted',
      )}
      style={{ minHeight: 'var(--tap-target)' }}
    >
      {body}
    </Link>
  )
}

/**
 * LES DÉBITEURS, dans l'ordre des montants dus.
 *
 * Le NUMÉRO est un lien `tel:` et non du texte : cette liste ne se lit pas, elle
 * s'appelle — et sur le téléphone posé sur le comptoir, un numéro qu'on ne peut pas
 * taper d'un pouce se recopie de travers.
 *
 * La dernière location est affichée parce que c'est la première phrase de l'appel :
 * « bonjour, c'est au sujet de la Clio du 12 août ». Sans elle, il faut ouvrir la
 * fiche avant de décrocher.
 */
function DebtorList({ rows, locale }: { rows: readonly CustomerLedger[]; locale: Locale }) {
  const { t } = useTranslation()

  if (rows.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState title={t('customer.ledger.noneDue')} body={t('customer.ledger.noneDueBody')} />
      </div>
    )
  }

  return (
    <ul className="mt-6 border-t border-border">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-3"
          style={{ minHeight: 'var(--row-height-comfy)' }}
        >
          <Link
            to="/$lang/app/clients/$customerId"
            params={{ lang: locale, customerId: row.id }}
            className="ledger-margin w-28 shrink-0 pe-4 font-medium text-primary underline-offset-4 hover:underline sm:w-40"
          >
            {row.label}
          </Link>

          {row.phone === null ? (
            <span className="text-xs text-muted-foreground">{t('customer.ledger.noPhone')}</span>
          ) : (
            <a
              href={`tel:${row.phone}`}
              className="numeric text-sm text-primary underline-offset-4 hover:underline"
            >
              {row.phone}
            </a>
          )}

          {row.lastRentalOn === null ? null : (
            <span className="numeric hidden text-xs text-muted-foreground sm:inline">
              {t('customer.ledger.lastRental', { date: formatDate(row.lastRentalOn, locale) })}
            </span>
          )}

          <span className="ms-auto flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="numeric text-2xs text-muted-foreground">
              {t('customer.ledger.paidOf', {
                paid: formatMoney(row.paidCents, locale, 'MAD', { withDecimals: false }),
                billed: formatMoney(row.billedCents, locale, 'MAD', { withDecimals: false }),
              })}
            </span>
            <span className="numeric text-base text-warning">
              {formatMoney(row.balanceCents, locale, 'MAD', { withDecimals: false })}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
