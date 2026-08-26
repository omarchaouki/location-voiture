import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { acceptInvitation, readInvitation } from '~/server/invitations'
import { textField } from '~/ui/forms/form-data'
import { useHydrated } from '~/ui/forms/use-hydrated'
import { Alert } from '~/ui/shadcn/alert'
import { Badge } from '~/ui/shadcn/badge'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/ui/shadcn/card'
import { Field, Input, Label } from '~/ui/shadcn/field'

/**
 * Acceptation d'une invitation.
 *
 * C'est l'unique porte d'entrée d'un client : il reçoit un lien, choisit son mot de
 * passe, et se retrouve dans son organisation. Le lien est à usage unique et valable
 * sept jours ; passé ce délai, la page ne dit rien de plus qu'« invitation expirée »,
 * pour ne pas révéler à qui elle était destinée.
 */
export const Route = createFileRoute('/$lang/invitation/$invitationId')({
  loader: async ({ params }) => ({
    invitation: await readInvitation({ data: { invitationId: params.invitationId } }),
  }),
  component: InvitationPage,
})

function InvitationPage() {
  const { t } = useTranslation()
  const { invitation } = Route.useLoaderData()
  const { lang, invitationId } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const hydrated = useHydrated()

  if (invitation.state === 'unusable') {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">{t('auth.invitationInvalid')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link to="/$lang/connexion" params={{ lang: locale }}>
              {t('auth.signIn')}
            </Link>
          </Button>
        </CardContent>
      </Shell>
    )
  }

  // Compte déjà existant : on ne recrée rien, on renvoie vers la connexion.
  if (invitation.accountExists) {
    return (
      <Shell>
        <CardHeader>
          <CardTitle className="text-lg tracking-tight">{t('auth.invitationTitle')}</CardTitle>
          <CardDescription className="text-sm">{invitation.organizationName}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link to="/$lang/connexion" params={{ lang: locale }}>
              {t('auth.alreadyAccount')}
            </Link>
          </Button>
        </CardContent>
      </Shell>
    )
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setFailed(false)

    try {
      await acceptInvitation({
        data: {
          invitationId,
          name: textField(form, 'name'),
          password: textField(form, 'password'),
        },
      })
      // Rechargement complet : la session vient d'être posée par le serveur.
      window.location.assign(`/${locale}/app`)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <Shell>
      <CardHeader>
        <CardTitle className="text-lg tracking-tight">{t('auth.invitationTitle')}</CardTitle>
        <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-ink">{invitation.organizationName}</span>
          <Badge variant="secondary">{t(`role.${invitation.role}`)}</Badge>
        </CardDescription>
        <CardDescription className="mt-2 text-sm">{t('auth.invitationIntro')}</CardDescription>
      </CardHeader>

      <CardContent>
        <form method="post" className="grid gap-5" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-1.5">
            <Label>{t('auth.email')}</Label>
            {/* L'adresse vient de l'invitation et ne se modifie pas : on ne choisit
                pas pour qui on crée le compte. Un champ désactivé serait trompeur —
                il donnerait l'apparence d'un contrôle qui n'en est pas un. */}
            <p className="numeric rounded-sm border border-rule bg-surface-sunken px-3 py-2 text-sm">
              {invitation.email}
            </p>
          </div>

          <Field label={t('auth.yourName')} htmlFor="invite-name">
            <Input id="invite-name" name="name" required minLength={2} autoComplete="name" />
          </Field>

          <Field
            label={t('auth.choosePassword')}
            htmlFor="invite-password"
            hint={t('auth.passwordHint')}
          >
            <Input
              id="invite-password"
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
            />
          </Field>

          {failed ? (
            <Alert role="alert" variant="destructive">
              {t('auth.invitationInvalid')}
            </Alert>
          ) : null}

          {/* Le bouton attend l'hydratation : sinon valider vite envoie un POST
              natif, la page se recharge et le compte n'est jamais créé.
              Voir src/ui/forms/use-hydrated.ts. */}
          <Button type="submit" disabled={!hydrated || busy} className="w-full">
            {busy ? t('auth.working') : t('auth.activate')}
          </Button>
        </form>
      </CardContent>
    </Shell>
  )
}

/** Même géométrie que la page de connexion : les deux portes se ressemblent. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center py-6 sm:min-h-[70vh]">
      <Card>{children}</Card>
    </div>
  )
}
