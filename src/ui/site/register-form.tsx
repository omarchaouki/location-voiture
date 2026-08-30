import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MIN_PASSWORD_LENGTH } from '~/core/schemas/signup'
import { formatMoney, formatNumber } from '~/i18n/format'
import type { Locale } from '~/i18n/locales'
import type { PublicPlan } from '~/server/pricing'
import { signUpAgency } from '~/server/signup'
import { trackLead } from '~/ui/analytics/meta-pixel'
import { ChoiceGroup } from '~/ui/forms/choice-group'
import { CityCombobox } from '~/ui/forms/city-combobox'
import { Field } from '~/ui/forms/fields'
import { textField } from '~/ui/forms/form-data'
import { StepProgress, useFormSteps } from '~/ui/forms/steps'
import { useHydrated } from '~/ui/forms/use-hydrated'
import { Alert } from '~/ui/shadcn/alert'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent } from '~/ui/shadcn/card'

/**
 * OUVRIR SON AGENCE — l'inscription qui donne un accès, pas un rappel.
 *
 * Le site ne savait que prendre une demande : on laissait son numéro, quelqu'un
 * rappelait, une organisation était montée à la main. Entre le clic et le premier
 * écran du produit il pouvait s'écouler deux jours, et deux jours après avoir comparé
 * trois logiciels, plus personne ne se souvient duquel il attend l'appel. Ce
 * formulaire-ci se termine dans le tableau de bord.
 *
 * **Onze champs, donc des ÉTAPES** (charte : au-delà de huit). Elles ne sont pas un
 * découpage arbitraire — chacune répond à une question différente, et c'est ce qui les
 * rend faciles à remplir : *quelle agence*, *qui êtes-vous*, *quelle offre*. L'offre
 * arrive en DERNIER délibérément : demander de choisir un tarif avant d'avoir rien
 * investi, c'est demander de partir comparer.
 *
 * Les étapes restent MONTÉES, cachées en CSS (`src/ui/forms/steps.tsx`) : `new
 * FormData(form)` ramasse tout d'un coup et revenir en arrière ne perd rien. Le
 * `noValidate` que pose `formProps` est obligatoire — un champ `required` invisible
 * fait échouer la soumission sans le moindre message.
 *
 * Le leurre `website` reste, comme sur le formulaire de prospect : c'est la protection
 * anti-robot la moins chère, et la seule qui n'impose rien au gérant de 55 ans à qui ce
 * produit s'adresse.
 */

/** Les étapes, dans l'ordre. Le nombre de panneaux se déduit d'ici, jamais recompté. */
const STEP_KEYS = ['agency', 'account', 'plan'] as const

export function RegisterForm({
  plans,
  locale,
  defaultPlanCode,
}: {
  plans: readonly PublicPlan[]
  locale: Locale
  /** Offre présélectionnée quand on arrive depuis une carte de la page tarifaire. */
  defaultPlanCode?: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const hydrated = useHydrated()
  const steps = useFormSteps(STEP_KEYS.length)

  /**
   * Le refus renvoyé par le serveur, et lui seul.
   *
   * `signUpAgency` ne LÈVE pas sur une adresse déjà prise : il rend un motif. Une
   * mutation « réussie » peut donc porter un refus, et c'est cet état-ci qui le
   * retient — pas `mutation.isError`, qui ne parle que des vraies pannes.
   */
  const [refusal, setRefusal] = useState<string | null>(null)

  const register = useMutation({
    mutationFn: signUpAgency,
    onSuccess: async (result) => {
      if (!result.ok) {
        setRefusal(result.reason)
        return
      }

      /*
       * LE PROSPECT EST COMPTÉ ICI, et pas ailleurs.
       *
       * Ni à la soumission du formulaire — un refus pour adresse déjà prise compterait
       * une conversion qui n'existe pas —, ni à l'arrivée sur `/app`, qui se visite
       * ensuite à chaque connexion. Ce point-ci est le seul du produit qu'on ne
       * traverse qu'une fois par agence créée.
       *
       * Avant `navigate`, aussi : la navigation démonte cet arbre, et `fbq` ne
       * retiendrait pas un appel émis pendant son démontage.
       */
      trackLead()

      /*
       * Les cookies de session sont posés par la réponse de la server function : à cet
       * instant la personne est déjà connectée, et `/app` s'ouvre sur son espace.
       */
      await navigate({ to: '/$lang/app', params: { lang: locale } })
    },
  })

  const busy = register.isPending || (register.isSuccess && refusal === null)

  /**
   * Les offres, en cartes comparables.
   *
   * Aucun code d'offre n'est écrit ici : la liste, les limites et les prix viennent de
   * la base (`listPublicPlans`). Une offre ajoutée en base apparaît, une offre retirée
   * disparaît, et ce fichier ne bouge pas.
   */
  const choices = plans.map((plan) => ({
    value: plan.code,
    label: t(plan.nameKey),
    detail: [
      plan.monthlyCents === 0
        ? t('site.pricing.free')
        : `${formatMoney(plan.monthlyCents, locale, plan.currency, { withDecimals: false })} / ${t('site.pricing.monthly').toLowerCase()}`,
      plan.maxVehicles === null
        ? t('site.unlimited')
        : `${formatNumber(plan.maxVehicles, locale)} ${t('site.limitVehicles').toLowerCase()}`,
      plan.maxUsers === null
        ? t('site.unlimited')
        : `${formatNumber(plan.maxUsers, locale)} ${t('site.limitUsers').toLowerCase()}`,
    ].join(' · '),
  }))

  /*
   * La durée d'essai vient de l'offre, jamais d'un nombre écrit ici.
   *
   * Toutes les offres portent la même aujourd'hui — c'est la promesse commerciale —
   * mais c'est une donnée en base : annoncer « 60 jours » en dur, c'est signer une
   * promesse que la prochaine grille démentira sans prévenir.
   */
  const trialDays = plans[0]?.trialDays ?? 0

  return (
    <Card>
      <CardContent className="grid gap-6">
        <StepProgress
          labels={STEP_KEYS.map((key) => t(`signup.step.${key}`))}
          current={steps.index}
          onGoTo={steps.goTo}
          liveLabel={t('form.stepLive', {
            current: steps.index + 1,
            total: STEP_KEYS.length,
            label: t(`signup.step.${STEP_KEYS[steps.index]}`),
          })}
        />

        {/*
          `method="post"` alors que React intercepte : c'est le comportement du jour où
          le JavaScript ne s'exécute pas. En GET, le navigateur mettrait l'adresse ET
          LE MOT DE PASSE dans l'URL — donc dans l'historique, dans les journaux du
          serveur et dans l'en-tête `Referer`.
        */}
        <form
          method="post"
          className="grid gap-5"
          {...steps.formProps}
          onSubmit={steps.handleSubmit((event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)

            const password = textField(form, 'password')
            const passwordConfirm = textField(form, 'passwordConfirm')
            /*
             * La confrontation se fait AUSSI côté serveur (`SignUpInput`). Celle-ci
             * n'est là que pour répondre tout de suite, et surtout pour ramener à
             * l'étape du champ fautif : un « les mots de passe diffèrent » affiché
             * sous le bouton, à deux écrans du champ, est un cul-de-sac.
             */
            if (password !== passwordConfirm) {
              steps.reportFieldError('passwordConfirm', t('signup.error.passwordMismatch'))
              return
            }

            setRefusal(null)
            register.mutate({
              data: {
                agencyName: textField(form, 'agencyName'),
                city: textField(form, 'city'),
                contactPhone: textField(form, 'contactPhone'),
                fullName: textField(form, 'fullName'),
                email: textField(form, 'email'),
                password,
                passwordConfirm,
                planCode: textField(form, 'planCode'),
                locale,
                website: textField(form, 'website'),
              },
            })
          })}
        >
          {/* Étape 1 — l'agence. */}
          <div data-step="0" hidden={steps.index !== 0} className="grid gap-5">
            <Field
              name="agencyName"
              label={t('signup.agencyName')}
              hint={t('signup.agencyNameHint')}
              autoComplete="organization"
              numeric={false}
              required
              maxLength={120}
            />
            <CityCombobox name="city" label={t('signup.city')} required />
            <Field
              name="contactPhone"
              label={t('signup.phone')}
              hint={t('site.fieldPhoneHint')}
              type="tel"
              autoComplete="tel"
              required
              maxLength={30}
            />
          </div>

          {/* Étape 2 — la personne, et son mot de passe. */}
          <div data-step="1" hidden={steps.index !== 1} className="grid gap-5">
            <Field
              name="fullName"
              label={t('auth.yourName')}
              autoComplete="name"
              numeric={false}
              required
              maxLength={120}
            />
            <Field
              name="email"
              label={t('auth.email')}
              hint={t('signup.emailHint')}
              type="email"
              autoComplete="email"
              numeric={false}
              required
              maxLength={180}
            />
            <Field
              name="password"
              label={t('auth.password')}
              hint={t('auth.passwordHint')}
              type="password"
              autoComplete="new-password"
              numeric={false}
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={200}
            />
            <Field
              name="passwordConfirm"
              label={t('signup.passwordConfirm')}
              type="password"
              autoComplete="new-password"
              numeric={false}
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={200}
            />
          </div>

          {/* Étape 3 — l'offre. */}
          <div data-step="2" hidden={steps.index !== 2} className="grid gap-5">
            <ChoiceGroup
              name="planCode"
              legend={t('signup.planLegend')}
              hint={t('signup.planHint', { days: trialDays })}
              options={choices}
              required
              columns={2}
              {...(defaultPlanCode === undefined ? {} : { defaultValue: defaultPlanCode })}
            />
            <Alert>{t('signup.trialNote', { days: trialDays })}</Alert>
          </div>

          {/*
            LE LEURRE. Masqué aux humains ET aux lecteurs d'écran, jamais `display:none`
            sur un champ que le navigateur remplirait automatiquement : `autoComplete`
            est coupé, et `tabIndex={-1}` le retire du parcours clavier.
          */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />

          {refusal !== null ? (
            <Alert role="alert" variant="destructive">
              {t(`signup.error.${refusal}`)}
            </Alert>
          ) : null}

          {register.isError ? (
            <Alert role="alert" variant="destructive">
              {t('signup.error.refused')}
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={steps.back}
              disabled={steps.isFirst || busy}
            >
              {t('form.stepBack')}
            </Button>

            {steps.isLast ? (
              /*
                Le bouton attend l'hydratation. Entre l'affichage du HTML et la fin de
                l'hydratation, valider enverrait un POST NATIF : la page se rechargerait
                et personne ne serait inscrit.
              */
              <Button type="submit" disabled={!hydrated || busy}>
                {busy ? t('auth.working') : t('signup.submit')}
              </Button>
            ) : (
              <Button type="button" onClick={steps.next}>
                {t('form.stepNext')}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
