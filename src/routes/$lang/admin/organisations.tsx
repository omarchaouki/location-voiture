import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatDate } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import {
  createOrganizationWithOwner,
  listOrganizations,
  startImpersonation,
  type AdminOrganization,
} from '~/server/admin'
import { Button } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { CityCombobox } from '~/ui/forms/city-combobox'
import { DataTable } from '~/ui/primitives/table'
import { Field, Select } from '~/ui/forms/fields'
import { choiceField, textField } from '~/ui/forms/form-data'
import { AdminOrganizationsSkeleton } from '~/ui/skeletons'
import { Card, CardBody, CardHeader, PageHeader } from '~/ui/primitives/card'
import { Badge } from '~/ui/shadcn/badge'

/**
 * Liste des organisations et création d'un client.
 *
 * C'est le flux principal du produit : je crée l'organisation, je choisis le plan,
 * j'envoie l'invitation. Tout en un geste — une organisation sans invitation est une
 * organisation que personne ne peut ouvrir.
 *
 * L'écran vivait à `/admin` et occupait à lui seul tout le back-office. Il est
 * descendu d'un cran : `/admin` est maintenant le tableau de bord, et cette page est
 * l'annuaire.
 */
export const Route = createFileRoute('/$lang/admin/organisations')({
  loader: async () => ({ organizations: await listOrganizations() }),
  pendingComponent: AdminOrganizationsSkeleton,
  component: AdminOrganizationsPage,
})

const PLANS = ['trial', 'starter', 'pro', 'business'] as const

function AdminOrganizationsPage() {
  const { t } = useTranslation()
  const { organizations } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ organizationId: string; message: string } | null>(
    null,
  )

  function errorFor(organizationId: string): string | null {
    return rowError?.organizationId === organizationId ? rowError.message : null
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setCreating(true)
    setError(null)
    setDone(false)

    try {
      const target = event.currentTarget
      await createOrganizationWithOwner({
        data: {
          name: textField(form, 'name'),
          slug: textField(form, 'slug'),
          city: textField(form, 'city'),
          planCode: choiceField(form, 'planCode', PLANS, 'trial'),
          localeDefault: 'fr',
          ownerEmail: textField(form, 'ownerEmail'),
        },
      })
      target.reset()
      setDone(true)
      await router.invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCreating(false)
    }
  }

  /**
   * « Consulter » ne fonctionnait pas pour certaines agences, et échouait EN SILENCE.
   *
   * Deux défauts, l'un derrière l'autre :
   *
   *  1. le bouton n'était grisé que si l'agence n'avait AUCUN membre. Or
   *     l'impersonation entre dans la peau du PROPRIÉTAIRE : une agence dont le seul
   *     membre est un gérant ou un agent affichait un bouton actif qui ne pouvait
   *     pas aboutir. `listOrganizations` calculait déjà `ownerUserId` — la valeur
   *     était là, personne ne la lisait ;
   *  2. l'appel partait en `void ...` : la promesse rejetée n'était rattrapée par
   *     personne. Le serveur renvoyait « organization has no member to impersonate »
   *     dans le vide, et l'écran ne bougeait pas. Un clic sans effet ET sans message
   *     est le pire des deux mondes — l'utilisateur reclique.
   */
  async function impersonate(organizationId: string) {
    setImpersonating(organizationId)
    setRowError(null)
    try {
      await startImpersonation({ data: { organizationId } })
      // Rechargement complet : les cookies de session viennent de changer.
      window.location.assign(`/${locale}/app`)
    } catch (cause) {
      setRowError({
        organizationId,
        message: cause instanceof Error ? cause.message : String(cause),
      })
      setImpersonating(null)
    }
  }

  return (
    <div>
      <PageHeader
        title={t('admin.organizations')}
        description={t('admin.organizationsBody')}
        meta={
          <span className="numeric text-xs text-muted">
            {organizations.length} {t('admin.organizationsCount')}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="order-2 lg:order-1">
          <CardHeader title={t('admin.organizations')} />
          {organizations.length === 0 ? (
            <CardBody>
              <EmptyState title={t('admin.noOrganizations')} body={t('admin.noOrganizationsBody')} />
            </CardBody>
          ) : (
            /*
              Un vrai `<table>`, pas une liste de rangées `flex`.
              Trois choses qu'une liste ne peut pas faire : nommer ses colonnes,
              aligner les valeurs d'une ligne à l'autre, et se laisser annoncer par un
              lecteur d'écran comme « Offre : pro » plutôt que « pro ».
            */
            <DataTable
              caption={t('admin.organizations')}
              rows={organizations}
              rowKey={(org) => org.id}
              rowDetail={(org) => <RowNotice org={org} error={errorFor(org.id)} />}
              columns={[
                {
                  key: 'name',
                  header: t('admin.orgName'),
                  cell: (org) => (
                    <>
                      <span className="font-medium">{org.name}</span>
                      <span className="numeric block text-xs text-muted">
                        {org.slug}
                        {org.city ? ` · ${org.city}` : ''}
                      </span>
                    </>
                  ),
                },
                { key: 'plan', header: t('admin.plan'), cell: (org) => <Badge>{org.planCode}</Badge> },
                {
                  key: 'status',
                  header: t('admin.status'),
                  cell: (org) => (
                    <Badge variant={org.status === 'active' ? 'calm' : 'warn'}>{org.status}</Badge>
                  ),
                },
                {
                  key: 'members',
                  header: t('admin.members'),
                  numeric: true,
                  cell: (org) => org.memberCount,
                },
                {
                  key: 'created',
                  header: t('admin.createdOn'),
                  numeric: true,
                  secondary: true,
                  cell: (org) => formatDate(org.createdAt, locale),
                },
                {
                  key: 'action',
                  header: t('admin.action'),
                  numeric: true,
                  width: '9rem',
                  cell: (org) => (
                    <Button
                      onClick={() => void impersonate(org.id)}
                      disabled={org.ownerUserId === null || impersonating === org.id}
                      title={org.ownerUserId === null ? t('admin.noOwnerYet') : undefined}
                    >
                      {impersonating === org.id ? t('auth.working') : t('admin.impersonate')}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </Card>

        {/*
          Le formulaire est en COLONNE sur écran large et EN PREMIER sur téléphone
          (`order-1 lg:order-2`) : c'est l'acte, la liste n'est que la mémoire. Sur un
          écran étroit, faire défiler quarante agences avant d'atteindre le formulaire
          revient à cacher la seule action de la page.
        */}
        <Card className="order-1 self-start lg:order-2">
          <CardHeader title={t('admin.newOrganization')} />
          <CardBody>
            <form method="post" onSubmit={(event) => void create(event)} className="grid gap-4">
              <Field name="name" label={t('admin.orgName')} required numeric={false} />
              <Field
                name="slug"
                label={t('admin.slug')}
                required
                numeric={false}
                pattern="[a-z0-9\-]+"
                hint={t('admin.slugHint')}
              />
              <CityCombobox name="city" label={t('admin.city')} />
              <Select
                name="planCode"
                label={t('admin.plan')}
                defaultValue="trial"
                options={PLANS}
                prefix="plan"
              />
              <Field
                name="ownerEmail"
                label={t('admin.ownerEmail')}
                type="email"
                autoComplete="email"
                required
                numeric={false}
                hint={t('admin.ownerEmailHint')}
              />

              <div>
                <Button type="submit" variant="default" disabled={creating} className="w-full">
                  {creating ? t('auth.working') : t('admin.create')}
                </Button>
                {done ? (
                  <p role="status" className="mt-2 text-sm text-calm">
                    {t('admin.created')}
                  </p>
                ) : null}
                {error ? (
                  <p role="alert" className="mt-2 text-sm text-danger">
                    {error}
                  </p>
                ) : null}
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

/**
 * Ce qui bloque une ligne, écrit SOUS la ligne concernée.
 *
 * Un bouton grisé sans explication est un cul-de-sac : l'utilisateur reclique, puis
 * conclut que le produit est cassé. La raison est donc toujours visible, et l'échec
 * éventuel du serveur est repris tel quel plutôt que perdu dans une promesse non
 * rattrapée.
 */
function RowNotice({ org, error }: { org: AdminOrganization; error: string | null }) {
  const { t } = useTranslation()

  if (org.ownerUserId === null) {
    return <p className="text-xs text-warn">{t('admin.noOwnerYet')}</p>
  }
  if (error) {
    return (
      <p role="alert" className="text-xs text-danger">
        {t('admin.impersonateFailed')} — {error}
      </p>
    )
  }
  return null
}
