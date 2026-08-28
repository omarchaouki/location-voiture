import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { displayedMonthlyCents, type BillingPeriod } from '~/core/billing'
import { recommendPlan, type PlanNeeds, type PlanRecommendation } from '~/core/plan-fit'
import type { FleetSize } from '~/core/schemas/lead'
import { formatMoney } from '~/i18n/format'
import type { Locale } from '~/i18n/locales'
import type { PublicPlan } from '~/server/pricing'
import { ChoiceGroup } from '~/ui/forms/choice-group'
import { choiceField } from '~/ui/forms/form-data'
import { StepNav, StepPane, StepProgress, useFormSteps } from '~/ui/forms/steps'
import { useHydrated } from '~/ui/forms/use-hydrated'
import { Badge } from '~/ui/shadcn/badge'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/ui/shadcn/card'

/**
 * QUESTIONNAIRE D'ORIENTATION — « quelle offre pour moi ? »
 *
 * Le tableau tarifaire répond à « que valent les offres ». Il ne répond pas à la seule
 * question que se pose vraiment un gérant de vingt voitures : LAQUELLE. Quatre lignes
 * et cinq colonnes lui demandent de faire lui-même l'arbitrage, avec des limites qu'il
 * doit d'abord traduire dans sa propre situation. Le questionnaire fait cette
 * traduction : quatre questions, et un nom d'offre.
 *
 * **Aucun code d'offre n'apparaît ici.** Le classement vit dans `src/core/plan-fit.ts`
 * et travaille sur le catalogue tel qu'il sort de la base, limites et fonctionnalités
 * comprises. Déplacer une limite en base change la réponse du questionnaire sans
 * qu'une ligne de cette page bouge — c'est la règle de docs/DOMAIN.md §3.2, appliquée
 * à la vitrine.
 *
 * Il sert aussi de deuxième porte vers le formulaire de démonstration, et lui passe la
 * taille de flotte déjà répondue : redemander à quelqu'un ce qu'il vient de dire est
 * la façon la plus sûre de le perdre au dernier champ.
 */

/**
 * Les paliers, et le BESOIN que chacun représente.
 *
 * Le palier haut vaut `null`, c'est-à-dire « illimité » : « plus de 40 voitures » ne
 * se laisse pas couvrir par une offre plafonnée à 40, et surtout pas par la plus
 * grande valeur du catalogue. `src/core/plan-fit.ts` porte cette règle.
 *
 * Les `value` des voitures sont exactement ceux de `FLEET_SIZES` : c'est ce qui permet
 * de reporter la réponse dans le formulaire de démonstration sans table de passage.
 */
const VEHICLE_TIERS: ReadonlyArray<{ value: FleetSize; key: string; need: number | null }> = [
  { value: '1-5', key: 'upTo5', need: 5 },
  { value: '6-15', key: 'upTo15', need: 15 },
  { value: '16-40', key: 'upTo40', need: 40 },
  { value: '40+', key: 'over40', need: null },
]

const USER_TIERS: ReadonlyArray<{ value: string; key: string; need: number | null }> = [
  { value: 'upTo2', key: 'upTo2', need: 2 },
  { value: 'upTo5', key: 'upTo5', need: 5 },
  { value: 'upTo10', key: 'upTo10', need: 10 },
  { value: 'over10', key: 'over10', need: null },
]

const BRANCH_TIERS: ReadonlyArray<{ value: string; key: string; need: number | null }> = [
  { value: 'one', key: 'one', need: 1 },
  { value: 'upTo3', key: 'upTo3', need: 3 },
  { value: 'over3', key: 'over3', need: null },
]

/**
 * Le GPS se pose en trois réponses, pas en deux cases à cocher.
 *
 * « Suivre » et « alerter à la sortie d'une zone » ne sont pas indépendants : on ne
 * demande pas le second sans le premier. Trois réponses ordonnées disent la même chose
 * que deux cases, sans permettre la combinaison qui n'existe pas.
 */
const GPS_TIERS: ReadonlyArray<{ value: string; key: string; features: readonly string[] }> = [
  { value: 'none', key: 'none', features: [] },
  { value: 'track', key: 'track', features: ['gps.track'] },
  { value: 'zones', key: 'zones', features: ['gps.track', 'gps.geofence'] },
]

function needOf(
  tiers: ReadonlyArray<{ value: string; need: number | null }>,
  value: string,
): number | null {
  return tiers.find((tier) => tier.value === value)?.need ?? null
}

export function PlanQuiz({
  plans,
  locale,
  period,
  onFleetSize,
}: {
  plans: readonly PublicPlan[]
  locale: Locale
  /**
   * Le rythme choisi dans la grille tarifaire, juste au-dessus.
   *
   * Il descend jusqu'ici pour que le conseil annonce le MÊME prix que la grille. Un
   * questionnaire qui répond « 799 MAD » pendant que la grille affiche « 666 MAD »
   * n'a pas l'air de proposer deux rythmes : il a l'air de se tromper.
   */
  period: BillingPeriod
  /** Reporte la taille de flotte répondue vers le formulaire de démonstration. */
  onFleetSize: (size: FleetSize) => void
}) {
  const { t } = useTranslation()
  const steps = useFormSteps(4)
  const hydrated = useHydrated()

  const [answer, setAnswer] = useState<{
    fleet: FleetSize
    /*
     * Les CLÉS des paliers choisis, pas les nombres derrière.
     *
     * Le récapitulatif se lit « calculé pour 16 à 40 voitures » : il rejoue les
     * libellés que la personne a cliqués. Écrit avec les nombres, il aurait fallu
     * dire « 40 » là où elle a répondu « plus de 40 » — c'est-à-dire lui renvoyer
     * autre chose que sa réponse, au moment précis où elle vérifie le conseil.
     */
    chosen: { vehicles: string; users: string; branches: string }
    result: PlanRecommendation<PublicPlan>
  } | null>(null)

  const labels = [
    t('site.quiz.stepVehicles'),
    t('site.quiz.stepUsers'),
    t('site.quiz.stepBranches'),
    t('site.quiz.stepTracking'),
  ]

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    const fleet = choiceField(
      form,
      'vehicles',
      VEHICLE_TIERS.map((tier) => tier.value),
      '1-5',
    )
    const gps = choiceField(
      form,
      'tracking',
      GPS_TIERS.map((tier) => tier.value),
      'none',
    )

    const users = choiceField(
      form,
      'users',
      USER_TIERS.map((tier) => tier.value),
      'upTo2',
    )
    const branches = choiceField(
      form,
      'branches',
      BRANCH_TIERS.map((tier) => tier.value),
      'one',
    )

    const needs: PlanNeeds = {
      vehicles: needOf(VEHICLE_TIERS, fleet),
      users: needOf(USER_TIERS, users),
      branches: needOf(BRANCH_TIERS, branches),
      features: GPS_TIERS.find((tier) => tier.value === gps)?.features ?? [],
    }

    setAnswer({
      fleet,
      chosen: {
        vehicles: VEHICLE_TIERS.find((tier) => tier.value === fleet)?.key ?? '',
        users: USER_TIERS.find((tier) => tier.value === users)?.key ?? '',
        branches: BRANCH_TIERS.find((tier) => tier.value === branches)?.key ?? '',
      },
      result: recommendPlan(plans, needs),
    })
    // Le formulaire de démonstration hérite de la réponse : il n'a pas à la redemander.
    onFleetSize(fleet)
  }

  return (
    <section id="quiz" className="border-b border-border py-14 sm:py-16">
      <h2 className="text-lg font-semibold tracking-tight">{t('site.quiz.title')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('site.quiz.body')}</p>

      <Card className="mt-8 max-w-3xl">
        <CardContent>
          <form
            method="post"
            {...steps.formProps}
            onSubmit={steps.handleSubmit(submit)}
            className="grid gap-6"
          >
            {/* Les questions restent MONTÉES sous le résultat : « modifier mes
                réponses » les retrouve telles quelles, sans rien avoir à restaurer. */}
            <div className={answer ? 'hidden' : 'grid gap-6'}>
              <StepProgress
                labels={labels}
                current={steps.index}
                onGoTo={steps.goTo}
                liveLabel={t('site.quiz.stepLive', {
                  current: steps.index + 1,
                  total: labels.length,
                  label: labels[steps.index] ?? '',
                })}
              />

              <StepPane index={0} current={steps.index} className="sm:grid-cols-1">
                <ChoiceGroup
                  name="vehicles"
                  required
                  columns={4}
                  legend={t('site.quiz.vehicles.legend')}
                  hint={t('site.quiz.vehicles.hint')}
                  options={VEHICLE_TIERS.map((tier) => ({
                    value: tier.value,
                    label: t(`site.quiz.vehicles.${tier.key}`),
                  }))}
                />
              </StepPane>

              <StepPane index={1} current={steps.index} className="sm:grid-cols-1">
                <ChoiceGroup
                  name="users"
                  required
                  columns={4}
                  legend={t('site.quiz.users.legend')}
                  hint={t('site.quiz.users.hint')}
                  options={USER_TIERS.map((tier) => ({
                    value: tier.value,
                    label: t(`site.quiz.users.${tier.key}`),
                  }))}
                />
              </StepPane>

              <StepPane index={2} current={steps.index} className="sm:grid-cols-1">
                <ChoiceGroup
                  name="branches"
                  required
                  columns={3}
                  legend={t('site.quiz.branches.legend')}
                  hint={t('site.quiz.branches.hint')}
                  options={BRANCH_TIERS.map((tier) => ({
                    value: tier.value,
                    label: t(`site.quiz.branches.${tier.key}`),
                  }))}
                />
              </StepPane>

              <StepPane index={3} current={steps.index} className="sm:grid-cols-1">
                <ChoiceGroup
                  name="tracking"
                  required
                  columns={3}
                  legend={t('site.quiz.tracking.legend')}
                  hint={t('site.quiz.tracking.hint')}
                  options={GPS_TIERS.map((tier) => ({
                    value: tier.value,
                    label: t(`site.quiz.tracking.${tier.key}`),
                    detail: t(`site.quiz.tracking.${tier.key}Detail`),
                  }))}
                />
              </StepPane>

              {/* Le bouton attend l'hydratation : avant elle, valider enverrait un POST
                  natif qui recharge la page sans rien calculer.
                  Voir src/ui/forms/use-hydrated.ts. */}
              <StepNav
                steps={steps}
                disabled={!hydrated}
                backLabel={t('site.quiz.back')}
                nextLabel={t('site.quiz.next')}
                submitLabel={t('site.quiz.see')}
              />
            </div>

            {answer ? (
              <QuizResult
                answer={answer}
                locale={locale}
                period={period}
                onRestart={() => {
                  setAnswer(null)
                  steps.goTo(0)
                }}
              />
            ) : null}
          </form>
        </CardContent>
      </Card>
    </section>
  )
}

/**
 * Le résultat.
 *
 * `role="status"` et non `alert` : une réponse attendue s'annonce, elle n'interrompt
 * pas. Le prix vient de la base comme partout ailleurs sur cette page — jamais du JSX.
 *
 * Le conseil se donne AVEC sa raison. « Offre Pro » tout seul demande de faire
 * confiance ; « Pro, parce que 40 voitures, 10 utilisateurs et le suivi GPS » se
 * vérifie, et c'est ce qui permet à quelqu'un de repérer qu'il a mal répondu.
 */
function QuizResult({
  answer,
  locale,
  period,
  onRestart,
}: {
  answer: {
    fleet: FleetSize
    chosen: { vehicles: string; users: string; branches: string }
    result: PlanRecommendation<PublicPlan>
  }
  locale: Locale
  period: BillingPeriod
  onRestart: () => void
}) {
  const { t } = useTranslation()
  const { plan, approximate, trial } = answer.result

  if (!plan) {
    return (
      <div role="status" className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t('site.quiz.noPlan')}</p>
        <Button type="button" variant="outline" onClick={onRestart}>
          {t('site.quiz.restart')}
        </Button>
      </div>
    )
  }

  return (
    <div role="status" className="grid gap-5">
      <Card className="border-ring bg-accent/40">
        <CardHeader>
          <Badge variant="accent">
            {approximate ? t('site.quiz.approximate') : t('site.quiz.recommended')}
          </Badge>
          <CardTitle className="mt-2 text-base">{t(plan.nameKey)}</CardTitle>
          {/* Le MÊME prix que la grille juste au-dessus, au même rythme de paiement. */}
          <CardDescription className="numeric text-sm">
            {t('site.quiz.pricePerMonth', {
              price: formatMoney(
                displayedMonthlyCents(period, plan.monthlyCents, plan.yearlyCents),
                locale,
                plan.currency,
                { withDecimals: false },
              ),
            })}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-2">
          <p className="text-sm">
            {t('site.quiz.because', {
              vehicles: t(`site.quiz.vehicles.${answer.chosen.vehicles}`),
              users: t(`site.quiz.users.${answer.chosen.users}`),
              branches: t(`site.quiz.branches.${answer.chosen.branches}`),
            })}
          </p>

          {/* L'essai n'est pas la réponse, c'est le point de départ — et il ne
              s'annonce que s'il couvre RÉELLEMENT le besoin exprimé. */}
          {trial ? (
            <p className="text-xs text-muted-foreground">
              {t('site.quiz.trialNote', { days: trial.trialDays })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {/* Un lien reste un <a> : jamais de <button> imbriqué dans une ancre. */}
        <Button asChild>
          <a href="#demo">
            <span>{t('site.quiz.talk')}</span>
            {/* Flèche DIRECTIONNELLE : elle se retourne en arabe. */}
            <ArrowRight className="icon-directional" aria-hidden="true" />
          </a>
        </Button>
        <Button type="button" variant="ghost" onClick={onRestart}>
          {t('site.quiz.restart')}
        </Button>
      </div>
    </div>
  )
}
