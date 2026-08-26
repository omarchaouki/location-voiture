import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { acceptInvitation, readInvitation } from '~/server/invitations'
import { EmptyState } from '~/ui/feedback/states'
import { textField } from '~/ui/forms/form-data'
import { BUTTON_STYLE, Button, buttonClasses } from '~/ui/primitives/button'
import { Stamp } from '~/ui/primitives/stamp'

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

  if (invitation.state === 'unusable') {
    return (
      <div className="mx-auto max-w-md">
        <EmptyState
          title={t('auth.invitationInvalid')}
          action={
            <Link
              to="/$lang/connexion"
              params={{ lang: locale }}
              className={buttonClasses('secondary')}
              style={BUTTON_STYLE}
            >
              <span>{t('auth.signIn')}</span>
            </Link>
          }
        />
      </div>
    )
  }

  // Compte déjà existant : on ne recrée rien, on renvoie vers la connexion.
  if (invitation.accountExists) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="font-display text-2xl">{t('auth.invitationTitle')}</h1>
        <p className="mt-3 text-sm text-muted">{invitation.organizationName}</p>
        <div className="mt-8">
          <Link
            to="/$lang/connexion"
            params={{ lang: locale }}
            className={buttonClasses('primary')}
            style={BUTTON_STYLE}
          >
            <span>{t('auth.alreadyAccount')}</span>
          </Link>
        </div>
      </div>
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
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-2xl">{t('auth.invitationTitle')}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-3">
        <span className="font-display text-md">{invitation.organizationName}</span>
        <Stamp>{invitation.role}</Stamp>
      </p>
      <p className="mt-3 text-sm text-muted">{t('auth.invitationIntro')}</p>

      <form method="post" className="mt-8 border-t border-rule pt-6" onSubmit={(event) => void submit(event)}>
        <p className="text-xs text-muted">{t('auth.email')}</p>
        {/* L'adresse vient de l'invitation et ne se modifie pas : on ne choisit pas
            pour qui on crée le compte. */}
        <p className="numeric mt-1 border border-rule bg-surface-sunken px-3 py-2 text-sm">
          {invitation.email}
        </p>

        <label className="mt-5 block">
          <span className="text-xs text-muted">{t('auth.yourName')}</span>
          <input
            name="name"
            required
            minLength={2}
            autoComplete="name"
            className="mt-1 block w-full border border-rule-strong bg-surface px-3 py-2 text-base"
            style={{ minHeight: 'var(--tap-target)' }}
          />
        </label>

        <label className="mt-5 block">
          <span className="text-xs text-muted">{t('auth.choosePassword')}</span>
          <input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="mt-1 block w-full border border-rule-strong bg-surface px-3 py-2 text-base"
            style={{ minHeight: 'var(--tap-target)' }}
          />
          <span className="mt-1 block text-2xs text-muted">{t('auth.passwordHint')}</span>
        </label>

        {failed ? (
          <p role="alert" className="mt-5 border-s-2 border-danger ps-3 text-sm text-danger">
            {t('auth.invitationInvalid')}
          </p>
        ) : null}

        <div className="mt-7">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? t('auth.working') : t('auth.activate')}
          </Button>
        </div>
      </form>
    </div>
  )
}
