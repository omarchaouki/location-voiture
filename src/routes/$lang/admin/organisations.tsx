import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDate } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import {
  createOrganizationWithOwner,
  listOrganizations,
  resendOwnerInvitation,
  startImpersonation,
  type AdminOrganization,
} from '~/server/admin'
import { EmptyState } from '~/ui/feedback/states'
import { CityCombobox } from '~/ui/forms/city-combobox'
import { choiceField, textField } from '~/ui/forms/form-data'
import { useHydrated } from '~/ui/forms/use-hydrated'
import { AdminOrganizationsSkeleton } from '~/ui/skeletons'
import { Alert } from '~/ui/shadcn/alert'
import { Badge } from '~/ui/shadcn/badge'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/ui/shadcn/card'
import { Field, Input, Select } from '~/ui/shadcn/field'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/ui/shadcn/table'

/**
 * ANNUAIRE DES AGENCES, et création d'un client.
 *
 * **Redessiné le 27/08/2026, sur trois défauts signalés à l'écran.**
 *
 *  1. **Le tableau était comprimé.** Il partageait la largeur avec un formulaire de
 *     22 rem posé à côté : à 1024 px, six colonnes se disputaient 660 px, et comme la
 *     primitive maison ne défilait pas, tout s'écrasait — jusqu'au bouton d'action de
 *     la dernière colonne. Le formulaire est descendu SOUS le tableau, qui prend
 *     maintenant toute la largeur et défile dans sa boîte quand il le faut.
 *  2. **« Consulter » se perdait** dans cette compression. Il est maintenant seul
 *     dans sa colonne, en fin de ligne, à largeur fixe.
 *  3. **« Aucun propriétaire n'a accepté son invitation » était un cul-de-sac.** Le
 *     message était juste et ne menait nulle part. Il porte désormais l'adresse
 *     invitée et un bouton pour relancer l'invitation — la seule chose qu'on puisse
 *     réellement faire depuis cet écran.
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
  const hydrated = useHydrated()

  const [creating, setCreating] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyRow, setBusyRow] = useState<string | null>(null)
  const [rowNotice, setRowNotice] = useState<
    { organizationId: string; kind: 'error' | 'sent'; message: string } | null
  >(null)

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const target = event.currentTarget
    setCreating(true)
    setError(null)
    setDone(false)

    try {
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
   * Le bouton n'était grisé que si l'agence n'avait AUCUN membre. Or l'impersonation
   * entre dans la peau du PROPRIÉTAIRE : une agence dont le seul membre est un gérant
   * affichait un bouton actif qui ne pouvait pas aboutir. Et l'appel partait en
   * `void ...`, donc l'erreur du serveur se perdait. Un clic sans effet ET sans
   * message est le pire des deux mondes : l'utilisateur reclique.
   */
  async function impersonate(organizationId: string) {
    setBusyRow(organizationId)
    setRowNotice(null)
    try {
      await startImpersonation({ data: { organizationId } })
      // Rechargement complet : les cookies de session viennent de changer.
      window.location.assign(`/${locale}/app`)
    } catch (cause) {
      setRowNotice({
        organizationId,
        kind: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
      })
      setBusyRow(null)
    }
  }

  async function resend(organizationId: string) {
    setBusyRow(organizationId)
    setRowNotice(null)
    try {
      const { email } = await resendOwnerInvitation({ data: { organizationId } })
      setRowNotice({ organizationId, kind: 'sent', message: email })
      await router.invalidate()
    } catch (cause) {
      setRowNotice({
        organizationId,
        kind: 'error',
        message: cause instanceof Error ? cause.message : String(cause),
      })
    } finally {
      setBusyRow(null)
    }
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">{t('admin.organizations')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('admin.organizationsBody')}</p>
        </div>
        <Badge variant="secondary" className="numeric">
          {organizations.length} {t('admin.organizationsCount')}
        </Badge>
      </header>

      <Card className="min-w-0 py-0">
        {organizations.length === 0 ? (
          <CardContent className="py-6">
            <EmptyState
              title={t('admin.noOrganizations')}
              body={t('admin.noOrganizationsBody')}
            />
          </CardContent>
        ) : (
          /*
            Un vrai `<table>`, pas une liste de rangées `flex`. Trois choses qu'une
            liste ne peut pas faire : nommer ses colonnes, aligner les valeurs d'une
            ligne à l'autre, et se laisser annoncer par un lecteur d'écran comme
            « Offre : pro » plutôt que « pro ».

            Il défile DANS sa carte quand la largeur manque — jamais la page.
          */
          <Table>
            <TableCaption className="sr-only">{t('admin.organizations')}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.orgName')}</TableHead>
                <TableHead>{t('admin.plan')}</TableHead>
                <TableHead>{t('admin.status')}</TableHead>
                <TableHead className="text-end">{t('admin.members')}</TableHead>
                <TableHead className="hidden text-end lg:table-cell">
                  {t('admin.createdOn')}
                </TableHead>
                <TableHead className="text-end">{t('admin.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <span className="font-medium">{org.name}</span>
                    <span className="numeric block text-xs text-muted-foreground">
                      {org.slug}
                      {org.city ? ` · ${org.city}` : ''}
                    </span>
                    <RowNotice
                      org={org}
                      notice={rowNotice?.organizationId === org.id ? rowNotice : null}
                      busy={busyRow === org.id}
                      disabled={!hydrated}
                      onResend={() => void resend(org.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge>{org.planCode}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={org.status === 'active' ? 'calm' : 'warn'}>{org.status}</Badge>
                  </TableCell>
                  <TableCell className="numeric text-end">{org.memberCount}</TableCell>
                  <TableCell className="numeric hidden text-end text-muted-foreground lg:table-cell">
                    {formatDate(org.createdAt, locale)}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      variant="outline"
                      onClick={() => void impersonate(org.id)}
                      disabled={!hydrated || org.ownerUserId === null || busyRow === org.id}
                      title={org.ownerUserId === null ? t('admin.noOwnerYet') : undefined}
                    >
                      {busyRow === org.id ? t('auth.working') : t('admin.impersonate')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/*
        Le formulaire est SOUS le tableau et prend toute la largeur.

        Il était en colonne à droite, ce qui coûtait un tiers de la largeur à
        l'annuaire en permanence — pour un acte qu'on fait quelques fois par mois. En
        pleine largeur, ses champs tiennent sur deux rangées au lieu de six, et le
        tableau respire.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.newOrganization')}</CardTitle>
          <CardDescription>{t('admin.ownerEmailHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={(event) => void create(event)} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('admin.orgName')} htmlFor="org-name">
                <Input id="org-name" name="name" required />
              </Field>

              <Field label={t('admin.slug')} htmlFor="org-slug" hint={t('admin.slugHint')}>
                <Input id="org-slug" name="slug" required pattern="[a-z0-9\-]+" />
              </Field>

              <CityCombobox name="city" label={t('admin.city')} />

              <Field label={t('admin.plan')} htmlFor="org-plan">
                <Select id="org-plan" name="planCode" defaultValue="trial">
                  {PLANS.map((plan) => (
                    <option key={plan} value={plan}>
                      {t(`plan.${plan}`)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label={t('admin.ownerEmail')}
                htmlFor="org-owner"
                className="sm:col-span-2 lg:col-span-1"
              >
                <Input id="org-owner" name="ownerEmail" type="email" autoComplete="email" required />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!hydrated || creating}>
                <Plus aria-hidden="true" />
                {creating ? t('auth.working') : t('admin.create')}
              </Button>
              {done ? (
                <Alert role="status" variant="success" className="flex-1">
                  {t('admin.created')}
                </Alert>
              ) : null}
              {error ? (
                <Alert role="alert" variant="destructive" className="flex-1">
                  {error}
                </Alert>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Ce qui bloque une ligne — et ce qu'on peut y faire.
 *
 * Un bouton grisé sans explication est un cul-de-sac : l'utilisateur reclique, puis
 * conclut que le produit est cassé. La raison est donc toujours visible SOUS la
 * ligne concernée, et surtout elle porte l'action qui la résout : relancer
 * l'invitation, avec l'adresse à qui elle part écrite en clair.
 */
function RowNotice({
  org,
  notice,
  busy,
  disabled,
  onResend,
}: {
  org: AdminOrganization
  notice: { kind: 'error' | 'sent'; message: string } | null
  busy: boolean
  disabled: boolean
  onResend: () => void
}) {
  const { t } = useTranslation()

  if (notice?.kind === 'sent') {
    return (
      <p role="status" className="mt-1.5 text-xs text-success">
        {t('admin.invitationResent', { email: notice.message })}
      </p>
    )
  }

  if (notice?.kind === 'error') {
    return (
      <p role="alert" className="mt-1.5 text-xs text-destructive">
        {notice.message}
      </p>
    )
  }

  if (org.ownerUserId === null) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs text-warning">{t('admin.noOwnerYet')}</span>
        {/*
          Le bouton n'apparaît QUE s'il y a une adresse à qui écrire.

          Sans ce test, on proposait « relancer l'invitation » sur les agences de
          démonstration — semées sans propriétaire et sans adresse de contact. Le
          serveur refusait, à juste titre, et l'écran offrait donc une action qui ne
          pouvait pas aboutir : exactement le cul-de-sac qu'on venait de corriger,
          déplacé d'un cran.
        */}
        {org.pendingInviteEmail ? (
          <>
            <span className="text-xs text-muted-foreground">{org.pendingInviteEmail}</span>
            <Button
              variant="link"
              size="sm"
              className="h-11 px-0"
              disabled={disabled || busy}
              onClick={onResend}
            >
              {busy ? t('auth.working') : t('admin.resendInvitation')}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{t('admin.noInvitationOnFile')}</span>
        )}
      </div>
    )
  }

  return null
}
