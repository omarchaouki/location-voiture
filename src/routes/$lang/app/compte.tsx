import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { authClient } from '~/auth/client'
import { Route as AppRoute } from '~/routes/$lang/app'
import { Field, FormError } from '~/ui/forms/fields'
import { textField } from '~/ui/forms/form-data'
import { useHydrated } from '~/ui/forms/use-hydrated'
import { Card, CardBody, CardHeader, PageHeader } from '~/ui/primitives/card'
import { Alert } from '~/ui/shadcn/alert'
import { Button } from '~/ui/shadcn/button'

/**
 * MON COMPTE — l'adresse et le mot de passe.
 *
 * Les deux manquaient. Un gérant dont l'adresse professionnelle change, ou qui a
 * partagé son mot de passe à un ancien employé, n'avait aucun recours dans le produit :
 * il fallait passer par une commande sur la machine qui héberge la base.
 *
 * Ce sont DEUX formulaires distincts, et jamais un seul. Un formulaire qui mélange
 * l'adresse et le mot de passe demande de tout retaper pour changer l'un des deux, et
 * il rend l'échec ambigu — laquelle des deux modifications a échoué ?
 *
 * Ce qui NE se change pas ici : l'organisation, le rôle, l'offre. Ce sont des décisions
 * d'agence ou de plateforme, pas des réglages personnels ; les mélanger à l'adresse
 * ferait croire qu'on peut se donner un rôle.
 */
export const Route = createFileRoute('/$lang/app/compte')({
  component: AccountPage,
})

function AccountPage() {
  const { t } = useTranslation()
  const { viewer } = AppRoute.useLoaderData()

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('account.title')} description={t('account.body')} />

      <div className="grid gap-6">
        <EmailCard currentEmail={viewer.email} />
        <PasswordCard />
      </div>
    </div>
  )
}

/**
 * L'adresse.
 *
 * Le changement n'est PAS immédiat : Better Auth envoie un lien de confirmation à
 * l'adresse ACTUELLE, et n'écrit la nouvelle qu'une fois ce lien suivi. L'écran le dit
 * avant l'envoi et le répète après — sans quoi la personne croirait avoir changé son
 * identifiant de connexion, et se retrouverait dehors au prochain retour.
 */
function EmailCard({ currentEmail }: { currentEmail: string }) {
  const { t } = useTranslation()
  const hydrated = useHydrated()
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const newEmail = textField(form, 'newEmail')

    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setError(t('account.emailUnchanged'))
      return
    }

    setState('sending')
    setError(null)
    try {
      const result = await authClient.changeEmail({ newEmail })
      if (result.error) throw new Error(result.error.message ?? 'change failed')
      setState('sent')
    } catch {
      setError(t('account.emailFailed'))
      setState('idle')
    }
  }

  return (
    <Card>
      <CardHeader title={t('account.emailTitle')} />
      <CardBody>
        <p className="text-sm text-muted-foreground">
          {t('account.emailCurrent', { email: currentEmail })}
        </p>

        <form
          method="post"
          className="mt-4 grid gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <Field
            name="newEmail"
            label={t('account.newEmail')}
            hint={t('account.emailHint')}
            type="email"
            inputMode="email"
            autoComplete="email"
            numeric={false}
            required
          />

          {error ? <FormError>{error}</FormError> : null}

          {state === 'sent' ? (
            // `status` et non `alert` : une confirmation s'annonce sans interrompre.
            <Alert role="status" variant="success">
              {t('account.emailSent', { email: currentEmail })}
            </Alert>
          ) : null}

          <div>
            {/* Le bouton attend l'hydratation : avant elle, valider enverrait un POST
                natif qui recharge la page sans rien faire. */}
            <Button type="submit" disabled={!hydrated || state === 'sending'}>
              {state === 'sending' ? t('auth.working') : t('account.emailSubmit')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

/**
 * Le mot de passe.
 *
 * L'ANCIEN est demandé, et ce n'est pas une formalité : sans lui, un poste laissé
 * déverrouillé cinq minutes suffit à prendre le compte définitivement.
 *
 * Les autres sessions sont révoquées à la validation. C'est presque toujours la raison
 * du changement — « quelqu'un d'autre a mon mot de passe » —, et un changement qui
 * laisse l'autre session ouverte ne règle rien.
 */
function PasswordCard() {
  const { t } = useTranslation()
  const hydrated = useHydrated()
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const target = event.currentTarget

    const currentPassword = textField(form, 'currentPassword')
    const newPassword = textField(form, 'newPassword')
    const confirm = textField(form, 'confirmPassword')

    if (newPassword !== confirm) {
      setError(t('account.passwordMismatch'))
      return
    }

    setState('sending')
    setError(null)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (result.error) throw new Error(result.error.message ?? 'change failed')
      target.reset()
      setState('done')
    } catch {
      // Le refus le plus fréquent est de loin le mauvais mot de passe actuel : on le
      // nomme, plutôt que de renvoyer « une erreur est survenue ».
      setError(t('account.passwordWrong'))
      setState('idle')
    }
  }

  return (
    <Card>
      <CardHeader title={t('account.passwordTitle')} />
      <CardBody>
        <p className="text-sm text-muted-foreground">{t('account.passwordBody')}</p>

        <form
          method="post"
          className="mt-4 grid gap-4"
          onSubmit={(event) => void submit(event)}
        >
          <Field
            name="currentPassword"
            label={t('account.currentPassword')}
            type="password"
            autoComplete="current-password"
            numeric={false}
            required
          />
          <Field
            name="newPassword"
            label={t('account.newPassword')}
            hint={t('account.passwordHint')}
            type="password"
            autoComplete="new-password"
            numeric={false}
            required
            minLength={10}
          />
          <Field
            name="confirmPassword"
            label={t('account.confirmPassword')}
            type="password"
            autoComplete="new-password"
            numeric={false}
            required
            minLength={10}
          />

          {error ? <FormError>{error}</FormError> : null}

          {state === 'done' ? (
            <Alert role="status" variant="success">
              {t('account.passwordChanged')}
            </Alert>
          ) : null}

          <div>
            <Button type="submit" disabled={!hydrated || state === 'sending'}>
              {state === 'sending' ? t('auth.working') : t('account.passwordSubmit')}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}
