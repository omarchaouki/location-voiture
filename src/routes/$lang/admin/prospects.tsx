import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatMoroccanPhone } from '~/core/phone'
import { formatDateTime } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { listLeads, markLeadContacted } from '~/server/leads'
import { EmptyState } from '~/ui/feedback/states'
import { AdminLeadsSkeleton } from '~/ui/skeletons'
import { DataTable } from '~/ui/primitives/table'
import { Button } from '~/ui/primitives/button'
import { Card, CardBody, CardHeader, PageHeader } from '~/ui/primitives/card'
import { Stamp } from '~/ui/primitives/stamp'

/**
 * PROSPECTS — les demandes de démonstration venues du site.
 *
 * Cet écran est livré dans la même session que le formulaire, et ce n'est pas un
 * détail d'organisation : la table `leads` existait depuis la Phase 1 et **personne
 * n'écrivait dedans**. Un formulaire qui écrit dans une table que personne ne
 * regarde ne vaut pas mieux qu'un formulaire qui jette.
 *
 * Une seule action : « rappelé ». Pas de tri, pas de filtre, pas de tableau croisé —
 * à ce volume, la liste par date suffit, et un back-office qu'on outille avant d'en
 * avoir besoin est un back-office qu'on maintient pour rien.
 */
export const Route = createFileRoute('/$lang/admin/prospects')({
  loader: async () => ({ leads: await listLeads() }),
  pendingComponent: AdminLeadsSkeleton,
  component: AdminLeadsPage,
})

function AdminLeadsPage() {
  const { t } = useTranslation()
  const { leads } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()

  async function contacted(leadId: string) {
    await markLeadContacted({ data: { leadId } })
    await router.invalidate()
  }

  const pending = leads.filter((lead) => lead.status === 'new').length

  return (
    <div>
      <PageHeader
        title={t('admin.leads')}
        description={t('admin.leadsBody')}
        meta={
          <span className="numeric text-xs text-muted">
            {t('admin.leadsPending', { count: pending })}
          </span>
        }
      />

      <Card>
        <CardHeader title={t('admin.leads')} />
        {leads.length === 0 ? (
          <CardBody>
            <EmptyState title={t('admin.noLeads')} body={t('admin.noLeadsBody')} />
          </CardBody>
        ) : (
          <DataTable
            caption={t('admin.leads')}
            rows={leads}
            rowKey={(lead) => lead.id}
            rowDetail={(lead) =>
              lead.message ? (
                <p className="border-s-2 border-rule ps-3 text-xs whitespace-pre-line text-muted">
                  {lead.message}
                </p>
              ) : null
            }
            columns={[
              {
                key: 'name',
                header: t('site.fieldName'),
                cell: (lead) => (
                  <>
                    <span className="font-medium">{lead.name}</span>
                    <span className="numeric block text-xs text-muted">
                      {/*
                        Rangé en E.164, affiché en forme nationale : c'est celle
                        qu'un gérant marocain reconnaît, et celle qu'il recompose.
                      */}
                      {formatMoroccanPhone(lead.phone)}
                    </span>
                  </>
                ),
              },
              {
                key: 'company',
                header: t('site.fieldCompany'),
                secondary: true,
                cell: (lead) => lead.company ?? '—',
              },
              { key: 'city', header: t('site.fieldCity'), cell: (lead) => lead.city ?? '—' },
              {
                key: 'fleet',
                header: t('site.fieldFleetSize'),
                numeric: true,
                cell: (lead) => lead.fleetSize ?? '—',
              },
              {
                key: 'status',
                header: t('admin.status'),
                cell: (lead) => (
                  <Stamp tone={lead.status === 'new' ? 'accent' : 'calm'}>
                    {t(`admin.leadStatus.${lead.status}`)}
                  </Stamp>
                ),
              },
              {
                key: 'received',
                header: t('admin.createdOn'),
                numeric: true,
                secondary: true,
                cell: (lead) => formatDateTime(lead.createdAt, locale),
              },
              {
                key: 'action',
                header: t('admin.action'),
                numeric: true,
                width: '9rem',
                cell: (lead) =>
                  lead.status === 'new' ? (
                    <Button onClick={() => void contacted(lead.id)}>
                      {t('admin.markContacted')}
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
    </div>
  )
}
