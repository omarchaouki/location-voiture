import { ArrowRight, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  BILLING_PERIODS,
  displayedMonthlyCents,
  monthsFreeOnYearly,
  yearlySavingsCents,
  type BillingPeriod,
} from '~/core/billing'
import { formatMoney, formatNumber } from '~/i18n/format'
import type { Locale } from '~/i18n/locales'
import type { PublicPlan } from '~/server/pricing'
import { Badge } from '~/ui/shadcn/badge'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent } from '~/ui/shadcn/card'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/ui/shadcn/table'
import { cn } from '~/ui/shadcn/utils'
import { Reveal } from './reveal'

/**
 * LES TARIFS.
 *
 * Trois règles tenues ici, et la première est celle dont tout le reste dépend.
 *
 * **1. Les prix sont LUS EN BASE.** Aucun montant n'est écrit dans ce fichier, pas
 * même la remise annuelle : « deux mois offerts » est CALCULÉ à partir de
 * `monthlyCents` et `yearlyCents` (`monthsFreeOnYearly`). Écrire la promesse en dur,
 * c'est signer un engagement que la prochaine grille démentira sans prévenir — et
 * c'est exactement la panne qu'un prix codé dans le JSX provoque sur une facture.
 *
 * **2. L'annuel est montré EN PREMIER.** C'est le prix par mois le plus bas, donc
 * celui auquel le visiteur compare tout le reste. L'ordre vient de `BILLING_PERIODS`,
 * pas d'un `useState` écrit à la main : la valeur par défaut et l'ordre des boutons
 * sont la même décision, et doivent le rester.
 *
 * **3. Deux mises en page, jamais les deux à la fois.** Des CARTES sous 768 px, un
 * TABLEAU au-dessus, et c'est un arbitrage assumé entre deux besoins réels :
 *
 *  - le tableau permet de lire « voitures » en travers de quatre offres. C'est la
 *    raison pour laquelle il avait été choisi, et elle reste vraie sur un écran large ;
 *  - sur 375 px, ce même tableau demande de faire défiler une boîte horizontalement
 *    pour comparer deux nombres. Un visiteur au comptoir ne le fait pas : il part.
 *
 * Une seule des deux est rendue à la fois — `hidden md:block` et son inverse — donc
 * rien n'est dit deux fois à un lecteur d'écran.
 */

export function PricingSection({
  plans,
  locale,
  period,
  onPeriod,
}: {
  plans: readonly PublicPlan[]
  locale: Locale
  period: BillingPeriod
  onPeriod: (period: BillingPeriod) => void
}) {
  const { t } = useTranslation()

  return (
    <Reveal as="section" id="tarifs" className="border-b border-border py-14 sm:py-16">
      <h2 className="text-lg font-semibold tracking-tight">{t('site.pricingTitle')}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('site.pricingBody')}</p>

      <PeriodToggle plans={plans} period={period} onPeriod={onPeriod} />

      {/* TÉLÉPHONE — une carte par offre, empilées, rien à faire défiler de côté. */}
      <div className="mt-8 grid gap-4 md:hidden">
        {plans.map((plan, index) => (
          <PlanCard key={plan.code} plan={plan} period={period} locale={locale} index={index} />
        ))}
      </div>

      {/* ÉCRAN LARGE — le tableau de comparaison, qui se lit en travers. */}
      <div className="mt-8 hidden md:block">
        <ComparisonTable plans={plans} period={period} locale={locale} />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t('site.pricingNote')}</p>
    </Reveal>
  )
}

/**
 * MENSUEL OU ANNUEL — de vrais boutons radio, simplement habillés.
 *
 * Même parti pris que `ChoiceGroup` : rien n'est réimplémenté. Le groupement par
 * `name`, les flèches du clavier et l'annonce du choix viennent du navigateur ; la
 * pastille coulissante n'est qu'un fond qui change de côté, lu en CSS
 * (`has-[:checked]:`). Un `<button>` à `aria-pressed` aurait demandé d'écrire tout ça,
 * et de l'écrire juste.
 *
 * **L'économie est annoncée À CÔTÉ du choix, pas dedans.** Un badge posé sur le bouton
 * « annuel » disparaît dès qu'on choisit le mensuel — c'est-à-dire au moment précis où
 * il faudrait rappeler ce qu'on laisse.
 */
function PeriodToggle({
  plans,
  period,
  onPeriod,
}: {
  plans: readonly PublicPlan[]
  period: BillingPeriod
  onPeriod: (period: BillingPeriod) => void
}) {
  const { t } = useTranslation()

  /*
   * La remise annoncée est celle de l'offre MISE EN AVANT — pas la plus généreuse du
   * catalogue. Annoncer « jusqu'à trois mois offerts » avec un chiffre pris sur
   * l'offre la plus chère est vrai à la lettre et faux à la lecture.
   */
  const reference = plans.find((plan) => plan.isRecommended) ?? plans.find((plan) => plan.monthlyCents > 0)
  const monthsFree = reference ? monthsFreeOnYearly(reference.monthlyCents, reference.yearlyCents) : 0

  return (
    <div className="mt-7 flex flex-wrap items-center gap-3">
      <fieldset>
        <legend className="sr-only">{t('site.pricing.periodLegend')}</legend>

        <div className="inline-flex rounded-lg border border-input bg-card p-1 shadow-control">
          {BILLING_PERIODS.map((value) => (
            <label
              key={value}
              style={{ minHeight: 'var(--tap-target)' }}
              className={cn(
                'flex cursor-pointer items-center justify-center rounded-md px-4 text-sm font-medium',
                'transition-colors hover:bg-accent',
                'has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:checked]:hover:bg-primary',
                'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring/55',
              )}
            >
              <input
                type="radio"
                name="billing-period"
                value={value}
                checked={period === value}
                onChange={() => onPeriod(value)}
                className="sr-only"
              />
              <span>{t(`site.pricing.${value}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {monthsFree > 0 ? (
        <Badge variant="calm">{t('site.pricing.monthsFree', { count: monthsFree })}</Badge>
      ) : null}
    </div>
  )
}

/**
 * Une offre, sur téléphone.
 *
 * La carte conseillée porte l'anneau ET le badge : la couleur ne dit jamais
 * l'information seule (`color-not-only`). Elle garde aussi sa place dans l'ordre du
 * catalogue plutôt que de remonter en tête — remonter une carte fait perdre la
 * progression des prix, qui est ce qui rend une grille lisible.
 */
function PlanCard({
  plan,
  period,
  locale,
  index,
}: {
  plan: PublicPlan
  period: BillingPeriod
  locale: Locale
  index: number
}) {
  const { t } = useTranslation()
  const limits = [
    { key: 'site.limitVehicles', value: plan.maxVehicles },
    { key: 'site.limitUsers', value: plan.maxUsers },
    { key: 'site.limitBranches', value: plan.maxBranches },
  ] as const

  return (
    <Reveal index={index}>
      <Card className={cn(plan.isRecommended && 'border-ring bg-accent/30')}>
        <CardContent className="grid gap-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold">{t(plan.nameKey)}</h3>
            {plan.isRecommended ? <Badge variant="accent">{t('site.pricing.recommended')}</Badge> : null}
          </div>

          <PlanPrice plan={plan} period={period} locale={locale} />

          <ul className="grid gap-1.5">
            {limits.map((limit) => (
              <li key={limit.key} className="flex items-center gap-2 text-sm">
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="numeric">
                  <Limit value={limit.value} locale={locale} />
                </span>
                <span className="text-muted-foreground">{t(limit.key)}</span>
              </li>
            ))}
          </ul>

          {plan.trialDays > 0 ? (
            <p className="text-xs text-muted-foreground">{t('site.trialDays', { days: plan.trialDays })}</p>
          ) : null}

          {/* Un lien reste un <a> : jamais de <button> imbriqué dans une ancre. */}
          <Button asChild variant={plan.isRecommended ? 'default' : 'outline'} className="w-full">
            <a href="#demo">
              <span>{t('site.pricing.cta')}</span>
              {/* Flèche DIRECTIONNELLE : elle se retourne en arabe. */}
              <ArrowRight className="icon-directional" aria-hidden="true" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </Reveal>
  )
}

/**
 * Le prix, toujours ramené AU MOIS.
 *
 * Afficher « 7 990 MAD / an » à côté de « 799 MAD / mois » demande une division
 * mentale que personne ne fait — et celui qui la fait de travers s'en va. Le total
 * annuel réellement facturé est rappelé en dessous, en petit : c'est lui qui part sur
 * la facture, et le cacher serait une promesse à moitié dite.
 *
 * Une offre à zéro n'affiche pas « 0,00 MAD » mais son mot : un prix nul formaté comme
 * un prix se lit comme une erreur de saisie.
 */
function PlanPrice({
  plan,
  period,
  locale,
}: {
  plan: PublicPlan
  period: BillingPeriod
  locale: Locale
}) {
  const { t } = useTranslation()

  if (plan.monthlyCents === 0) {
    return <p className="text-2xl font-semibold tracking-tight">{t('site.pricing.free')}</p>
  }

  const shown = displayedMonthlyCents(period, plan.monthlyCents, plan.yearlyCents)
  const savings = yearlySavingsCents(plan.monthlyCents, plan.yearlyCents)

  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className="numeric text-2xl font-semibold tracking-tight">
          {formatMoney(shown, locale, plan.currency, { withDecimals: false })}
        </span>
        <span className="text-sm text-muted-foreground">{t('billing.perMonth')}</span>
      </p>

      {period === 'yearly' ? (
        <p className="numeric mt-1 text-xs text-muted-foreground">
          {t('site.pricing.billedYearly', {
            total: formatMoney(plan.yearlyCents, locale, plan.currency, { withDecimals: false }),
          })}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{t('site.pricing.billedMonthly')}</p>
      )}

      {period === 'yearly' && savings > 0 ? (
        <p className="numeric mt-1 text-xs font-medium text-success">
          {t('site.pricing.savings', {
            amount: formatMoney(savings, locale, plan.currency, { withDecimals: false }),
          })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Le tableau, sur écran large.
 *
 * La ligne conseillée est teintée ET porte le badge, pour la même raison que la carte.
 * `aria-label` sur la ligne aurait été le réflexe ; le badge est préférable — il est
 * lu par tout le monde, et pas seulement par les lecteurs d'écran.
 */
function ComparisonTable({
  plans,
  period,
  locale,
}: {
  plans: readonly PublicPlan[]
  period: BillingPeriod
  locale: Locale
}) {
  const { t } = useTranslation()

  return (
    <Card className="py-0">
      <Table>
        <TableCaption className="sr-only">{t('site.pricingTitle')}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t('billing.plan')}</TableHead>
            <TableHead className="text-end">{t('billing.perMonth')}</TableHead>
            <TableHead className="text-end">{t('site.limitVehicles')}</TableHead>
            <TableHead className="text-end">{t('site.limitUsers')}</TableHead>
            <TableHead className="text-end">{t('site.limitBranches')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>

        <TableBody>
          {plans.map((plan) => (
            <TableRow key={plan.code} className={cn(plan.isRecommended && 'bg-accent/40')}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t(plan.nameKey)}</span>
                  {plan.isRecommended ? (
                    <Badge variant="accent">{t('site.pricing.recommended')}</Badge>
                  ) : null}
                </div>
                {plan.trialDays > 0 ? (
                  <span className="block text-xs text-muted-foreground">
                    {t('site.trialDays', { days: plan.trialDays })}
                  </span>
                ) : null}
              </TableCell>

              <TableCell className="text-end">
                <CellPrice plan={plan} period={period} locale={locale} />
              </TableCell>

              <TableCell className="numeric text-end">
                <Limit value={plan.maxVehicles} locale={locale} />
              </TableCell>
              <TableCell className="numeric text-end">
                <Limit value={plan.maxUsers} locale={locale} />
              </TableCell>
              <TableCell className="numeric text-end text-muted-foreground">
                <Limit value={plan.maxBranches} locale={locale} />
              </TableCell>

              <TableCell className="text-end">
                <Button asChild size="sm" variant={plan.isRecommended ? 'default' : 'outline'}>
                  <a href="#demo">{t('site.pricing.cta')}</a>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

/** Le prix dans une cellule : le montant, et ce qui le facture, sur deux lignes. */
function CellPrice({
  plan,
  period,
  locale,
}: {
  plan: PublicPlan
  period: BillingPeriod
  locale: Locale
}) {
  const { t } = useTranslation()

  if (plan.monthlyCents === 0) {
    return <span className="font-medium">{t('site.pricing.free')}</span>
  }

  const shown = displayedMonthlyCents(period, plan.monthlyCents, plan.yearlyCents)

  return (
    <>
      <span className="numeric font-medium">
        {formatMoney(shown, locale, plan.currency, { withDecimals: false })}
      </span>
      {period === 'yearly' ? (
        <span className="numeric block text-2xs text-muted-foreground">
          {t('site.pricing.billedYearly', {
            total: formatMoney(plan.yearlyCents, locale, plan.currency, { withDecimals: false }),
          })}
        </span>
      ) : null}
    </>
  )
}

/** `null` veut dire illimité, et le DIT — une case vide se lit « zéro ». */
export function Limit({ value, locale }: { value: number | null; locale: Locale }) {
  const { t } = useTranslation()
  return <>{value === null ? t('site.unlimited') : formatNumber(value, locale)}</>
}
