import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatDate } from '~/i18n/format'
import type { Locale } from '~/i18n/locales'
import { requestPlanChange, withdrawPlanChange } from '~/server/billing'
import { Field, FormError, Select, TextArea } from '~/ui/forms/fields'
import { textField } from '~/ui/forms/form-data'
import { Card, CardBody, CardHeader } from '~/ui/primitives/card'
import { Alert } from '~/ui/shadcn/alert'
import { Badge } from '~/ui/shadcn/badge'
import { Button } from '~/ui/shadcn/button'

/**
 * DEMANDE DE CHANGEMENT D'OFFRE.
 *
 * Le client DEMANDE, la plateforme DÉCIDE — et l'écran le dit avant qu'on remplisse
 * quoi que ce soit. Un formulaire qui ressemble à un réglage et qui produit en réalité
 * une demande à traiter par un humain est la meilleure façon de faire croire à un
 * changement immédiat, puis de perdre la confiance quand rien ne bouge.
 *
 * Ce n'est pas une limitation technique : l'offre porte un prix, des quotas et une
 * facturation. Une agence qui descendrait seule de 40 à 5 voitures se retrouverait
 * au-dessus du quota avec 38 voitures en base, donc bloquée jusqu'à en supprimer 33.
 *
 * Le motif est OBLIGATOIRE. C'est ce que le commercial lit en premier, et c'est ce qui
 * transforme « offre Pro » en une décision qu'on peut prendre sans rappeler le client.
 */
export function PlanChangeCard({
  currentPlanCode,
  plans,
  pending,
  canRequest,
  locale,
}: {
  currentPlanCode: string
  /** Les offres publiques, lues en base par l'écran. Aucun code d'offre ici. */
  plans: readonly string[]
  pending: { id: string; requestedPlanCode: string; reason: string | null; requestedAt: string } | null
  /** `owner` seulement : c'est un engagement financier, pas un réglage. */
  canRequest: boolean
  locale: Locale
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      // Chaque refus est nommé : « une erreur est survenue » sur une demande déjà
      // déposée envoie l'utilisateur au support pour un message qu'on sait écrire.
      setError(
        /requestAlreadyPending/.test(message)
          ? t('billing.requestAlreadyPending')
          : /requestSamePlan/.test(message)
            ? t('billing.requestSamePlan')
            : t('error.genericTitle'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader title={t('billing.changePlanTitle')} />
      <CardBody>
        {pending ? (
          <div className="grid gap-4">
            {/* `status` et non `alert` : une demande en cours n'est pas un problème. */}
            <Alert role="status">
              {t('billing.requestPendingBody', {
                plan: t(`plan.${pending.requestedPlanCode}`),
                date: formatDate(pending.requestedAt.slice(0, 10), locale),
              })}
            </Alert>

            {pending.reason ? (
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground">{t('billing.requestReason')} </span>
                {pending.reason}
              </p>
            ) : null}

            {error ? <FormError>{error}</FormError> : null}

            {canRequest ? (
              <div>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act(() => withdrawPlanChange({ data: { id: pending.id } }))}
                >
                  {busy ? t('auth.working') : t('billing.withdrawRequest')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : canRequest ? (
          <form
            method="post"
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              void act(() =>
                requestPlanChange({
                  data: {
                    requestedPlanCode: textField(form, 'requestedPlanCode'),
                    reason: textField(form, 'reason'),
                  },
                }),
              )
            }}
          >
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t('billing.changePlanBody')}
            </p>

            <Select
              name="requestedPlanCode"
              label={t('billing.requestedPlan')}
              options={plans}
              prefix="plan"
              defaultValue={plans.find((code) => code !== currentPlanCode) ?? currentPlanCode}
            />
            <Field
              name="currentPlan"
              label={t('billing.currentPlan')}
              defaultValue={t(`plan.${currentPlanCode}`)}
              numeric={false}
              readOnly
            />
            <TextArea
              name="reason"
              label={t('billing.requestReasonLabel')}
              hint={t('billing.requestReasonHint')}
              required
              rows={3}
            />

            {error ? <FormError>{error}</FormError> : null}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? t('auth.working') : t('billing.submitRequest')}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{t('billing.ownerOnly')}</p>
        )}

        <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="neutral">{t('billing.approvalRequired')}</Badge>
          {t('billing.approvalNote')}
        </p>
      </CardBody>
    </Card>
  )
}
