import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { settleReturn, type Settlement } from '~/core/settlement'
import { formatMoney, formatNumber } from '~/i18n/format'
import type { Locale } from '~/i18n/locales'
import { Field } from '~/ui/forms/fields'
import { useHydrated } from '~/ui/forms/use-hydrated'
import { Button } from '~/ui/shadcn/button'
import { CheckboxField } from '~/ui/shadcn/field'
import { cn } from '~/ui/shadcn/utils'

/**
 * LE RETOUR AU COMPTOIR — constats à gauche, décompte à droite.
 *
 * L'écran précédent posait quatre champs nus, dont un « Retenue sur caution (MAD) »
 * que l'agent devait remplir de tête, devant le client, en fin de journée. Trois
 * calculs se faisaient donc mentalement : les jours de retard, ce qui restait dû après
 * les acomptes, et ce que la caution couvrait. Le troisième se trompait dans le sens
 * qui fâche — on rendait la caution entière en oubliant de facturer le retard.
 *
 * Ce panneau ne fait rien de plus que MONTRER ce calcul pendant qu'on saisit. C'est
 * tout l'objet : un décompte qu'on peut tourner vers le client est aussi un décompte
 * qu'il peut contester, ligne par ligne, avant de signer.
 *
 * **Le calcul affiché n'est pas celui qui fait foi.** `settleReturn` est un module pur,
 * appelé ici pour l'aperçu et RECALCULÉ par le serveur à l'enregistrement. L'écran ne
 * poste que des constats — un compteur, une jauge, des frais ; jamais un total. Un
 * client de l'API qui pourrait poster un `totalCents` choisirait le prix de sa
 * location.
 */

export interface ReturnPanelContract {
  actualStartAt: string | null
  plannedStartAt: string
  plannedEndAt: string
  dailyCents: number
  daysBilled: number
  discountCents: number
  extrasCents: number
  depositCents: number
  currency: string
  startKm: number | null
  startFuelEighths: number | null
}

export interface ReturnSubmission {
  endKm: number
  endFuelEighths: number
  fuelChargeCents: number
  damageChargeCents: number
  /**
   * OMIS tant que l'agent n'a rien décidé lui-même.
   *
   * En mode automatique, renvoyer le montant affiché figerait la proposition calculée
   * ICI, avec l'horloge du navigateur. Le serveur recalcule la sienne à la seconde de
   * l'enregistrement : sur un retour validé à cheval sur minuit, la sienne compte un
   * jour de plus — et c'est la bonne. On ne lui impose un montant que lorsque
   * quelqu'un en a réellement choisi un.
   */
  depositWithheldCents?: number
  returnDeposit: boolean
}

/** Saisie en dirhams à la virgule ou au point, stockée en centimes entiers. */
function toCents(text: string): number {
  const raw = text.replace(',', '.').trim()
  if (raw === '') return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function ReturnPanel({
  contract,
  paidCents,
  locale,
  busy,
  onSubmit,
}: {
  contract: ReturnPanelContract
  paidCents: number
  locale: Locale
  busy: boolean
  onSubmit: (submission: ReturnSubmission) => void
}) {
  const { t } = useTranslation()
  const hydrated = useHydrated()

  const [endKm, setEndKm] = useState('')
  const [endFuel, setEndFuel] = useState('8')
  const [fuelCharge, setFuelCharge] = useState('')
  const [damageCharge, setDamageCharge] = useState('')

  /**
   * `null` = on suit la proposition du décompte.
   *
   * Dès que l'agent écrit un montant, on cesse de le corriger sous ses doigts : une
   * retenue qui se remet toute seule à sa valeur « logique » pendant qu'on tape à côté
   * est la façon la plus sûre de faire enregistrer un montant que personne n'a voulu.
   */
  const [withheldText, setWithheldText] = useState<string | null>(null)
  const [returnDeposit, setReturnDeposit] = useState(true)

  /**
   * L'HEURE DU RETOUR.
   *
   * Lire l'horloge pendant le rendu produirait deux valeurs différentes au serveur et
   * au navigateur, et React refuserait l'hydratation. On passe donc par `useHydrated`,
   * qui est bâti sur `useSyncExternalStore` : il rend `false` au rendu serveur ET à la
   * première passe du navigateur — les deux HTML coïncident —, puis `true`.
   *
   * L'instant est lu UNE FOIS, par l'initialiseur paresseux de `useState` : il
   * s'exécute au montage et jamais plus. Sans ce gel, chaque frappe relirait l'horloge
   * et le décompte bougerait sous les doigts de l'agent pendant qu'il saisit.
   *
   * La valeur n'est utilisée qu'une fois `hydrated` vrai. Tant qu'il est faux — rendu
   * serveur et première passe du navigateur — c'est le retour prévu qui s'affiche des
   * deux côtés, donc aucun écart d'hydratation.
   *
   * Deux fausses bonnes idées écartées ici : un `useEffect` qui appellerait
   * `setReturnedAt` (rendu en cascade, refusé par `react-hooks/set-state-in-effect`)
   * et une `ref` lue pendant le rendu (refusée par `react-hooks/refs`). Les deux
   * contournaient le problème ; l'initialiseur paresseux le résout.
   *
   * L'écart avec l'horloge du serveur à l'enregistrement est de quelques secondes ; il
   * ne change le nombre de jours que si l'on valide à cheval sur minuit, et c'est
   * alors le serveur qui tranche.
   */
  const [clientNow] = useState(() => new Date().toISOString())
  const returnedAt = hydrated ? clientNow : contract.plannedEndAt

  const settlement: Settlement = settleReturn(
    {
      startAt: contract.actualStartAt ?? contract.plannedStartAt,
      plannedEndAt: contract.plannedEndAt,
      actualEndAt: returnedAt,
      dailyCents: contract.dailyCents,
      daysAlreadyBilled: contract.daysBilled,
      discountCents: contract.discountCents,
      baseExtrasCents: contract.extrasCents,
      fuelChargeCents: toCents(fuelCharge),
      damageChargeCents: toCents(damageCharge),
      depositCents: contract.depositCents,
      paidCents,
      startFuelEighths: contract.startFuelEighths,
      endFuelEighths: Number(endFuel) || 0,
      startKm: contract.startKm,
      endKm: Number(endKm) || 0,
    },
    withheldText === null ? undefined : toCents(withheldText),
  )

  const money = (cents: number) => formatMoney(cents, locale, contract.currency)
  const overridden = withheldText !== null

  return (
    <form
      method="post"
      data-print="hide"
      className="mt-8 border-t border-border pt-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({
          endKm: Number(endKm) || 0,
          endFuelEighths: Number(endFuel) || 0,
          fuelChargeCents: toCents(fuelCharge),
          damageChargeCents: toCents(damageCharge),
          // Le montant n'est transmis que si quelqu'un l'a choisi : sinon le serveur
          // calcule le sien, avec son horloge. Voir `ReturnSubmission`.
          ...(withheldText === null
            ? {}
            : { depositWithheldCents: settlement.depositWithheldCents }),
          returnDeposit,
        })
      }}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------------------------------------------------- les constats */}
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <h3 className="text-sm font-semibold sm:col-span-2">{t('contract.settlement.observed')}</h3>

          <Field
            name="endKm"
            label={t('contract.endKm')}
            type="number"
            inputMode="numeric"
            required
            value={endKm}
            onChange={(event) => setEndKm(event.target.value)}
            {...(settlement.kmDriven === null
              ? {}
              : { hint: t('contract.settlement.kmDriven', { km: formatNumber(settlement.kmDriven, locale) }) })}
          />

          <Field
            name="endFuelEighths"
            label={t('contract.fuel')}
            type="number"
            inputMode="numeric"
            min={0}
            max={8}
            required
            value={endFuel}
            onChange={(event) => setEndFuel(event.target.value)}
            {...(settlement.fuelShortfallEighths > 0
              ? { hint: t('contract.settlement.fuelShortfall', { count: settlement.fuelShortfallEighths }) }
              : {})}
          />

          <Field
            name="fuelCharge"
            label={t('contract.settlement.fuelCharge')}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={fuelCharge}
            onChange={(event) => setFuelCharge(event.target.value)}
            hint={t('contract.settlement.fuelChargeHint')}
          />

          <Field
            name="damageCharge"
            label={t('contract.settlement.damages')}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={damageCharge}
            onChange={(event) => setDamageCharge(event.target.value)}
          />
        </div>

        {/* ---------------------------------------------------- le décompte */}
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <h3 className="text-sm font-semibold">{t('contract.settlement.title')}</h3>

          <dl className="mt-3">
            <Line
              label={`${formatNumber(settlement.daysBilled, locale)} ${t('contract.days')}`}
              value={money(settlement.daysBilled * contract.dailyCents)}
              {...(settlement.lateDays > 0
                ? { note: t('contract.settlement.lateDays', { count: settlement.lateDays }) }
                : {})}
            />

            {settlement.extrasCents > 0 ? (
              <Line label={t('contract.extras')} value={money(settlement.extrasCents)} />
            ) : null}

            {contract.discountCents > 0 ? (
              <Line label={t('contract.discount')} value={`−${money(contract.discountCents)}`} />
            ) : null}

            <Line label={t('contract.vat')} value={money(settlement.vatCents)} />
            <Line label={t('contract.total')} value={money(settlement.totalCents)} strong />

            {settlement.paidCents > 0 ? (
              <Line label={t('contract.paid')} value={`−${money(settlement.paidCents)}`} />
            ) : null}

            <Line
              label={
                settlement.balanceCents >= 0
                  ? t('contract.remaining')
                  : t('contract.settlement.overpaid')
              }
              value={money(Math.abs(settlement.balanceCents))}
              strong
              tone={settlement.balanceCents > 0 ? 'warn' : 'calm'}
            />
          </dl>

          {/* --- La caution, et ce qu'elle couvre. --- */}
          {contract.depositCents > 0 ? (
            <div className="mt-5 border-t border-border pt-4">
              <dl>
                <Line label={t('contract.settlement.depositHeld')} value={money(contract.depositCents)} />
              </dl>

              <div className="mt-3">
                <Field
                  name="withheld"
                  label={t('contract.withheld')}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={withheldText ?? fromCents(settlement.suggestedWithheldCents)}
                  onChange={(event) => setWithheldText(event.target.value)}
                  {...(overridden &&
                  settlement.depositWithheldCents !== settlement.suggestedWithheldCents
                    ? {
                        hint: t('contract.settlement.suggested', {
                          amount: money(settlement.suggestedWithheldCents),
                        }),
                      }
                    : { hint: t('contract.settlement.withheldAuto') })}
                />

                {overridden ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1"
                    onClick={() => setWithheldText(null)}
                  >
                    {t('contract.settlement.resetWithheld')}
                  </Button>
                ) : null}
              </div>

              <dl className="mt-3">
                <Line
                  label={t('contract.settlement.dueBack')}
                  value={money(settlement.depositDueBackCents)}
                  strong
                  tone="calm"
                />
              </dl>

              {/*
                DEUX QUESTIONS DISTINCTES, et les confondre était le défaut de la
                version précédente : on pouvait cocher « restituer la caution » tout en
                retenant 500 dirhams. Combien on retient est un calcul ; si l'argent
                est physiquement reparti est un fait. Tant que la case n'est pas cochée,
                l'alerte « caution non restituée » se déclenche 48 h après le retour.
              */}
              {settlement.depositDueBackCents > 0 ? (
                <div className="mt-2">
                  <CheckboxField
                    name="returnDeposit"
                    checked={returnDeposit}
                    onChange={(event) => setReturnDeposit(event.target.checked)}
                    label={t('contract.returnDeposit')}
                  />
                  <p className="text-2xs text-muted-foreground">
                    {t('contract.settlement.returnDepositHint')}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/*
            LA CONCLUSION : ce qui change de main, maintenant.

            Le `<p>` du cas « rien à faire » est SŒUR de la liste, jamais dedans : un
            paragraphe n'est pas un enfant valide de `<dl>`, et un lecteur d'écran qui
            traverse une liste de définitions mal formée annonce ses éléments de
            travers.
          */}
          <div className="mt-5 border-t border-border pt-4">
            {settlement.remainingToCollectCents > 0 || settlement.refundDueCents > 0 ? (
              <dl>
                {settlement.remainingToCollectCents > 0 ? (
                  <Line
                    label={t('contract.settlement.toCollect')}
                    value={money(settlement.remainingToCollectCents)}
                    strong
                    tone="warn"
                  />
                ) : null}

                {settlement.refundDueCents > 0 ? (
                  <Line
                    label={t('contract.settlement.refund')}
                    value={money(settlement.refundDueCents)}
                    strong
                    tone="warn"
                  />
                ) : null}
              </dl>
            ) : (
              <p className="text-sm text-success">{t('contract.settlement.nothingDue')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Le bouton attend l'hydratation : avant elle, valider enverrait un POST natif
          qui recharge la page sans rien enregistrer. Voir src/ui/forms/use-hydrated.ts. */}
      <div className="mt-6">
        <Button type="submit" disabled={busy || !hydrated}>
          {busy ? t('auth.working') : t('contract.returnAction')}
        </Button>
      </div>
    </form>
  )
}

/**
 * Une ligne du décompte.
 *
 * Le montant est en chiffres tabulaires et aligné sur la FIN de la ligne — donc à
 * gauche en arabe, sans une seule propriété physique. La `note` porte l'explication
 * (« dont 2 jours de retard ») : un montant qu'on ne sait pas justifier est un montant
 * qu'on finit par abandonner devant un client qui insiste.
 */
function Line({
  label,
  value,
  note,
  strong,
  tone,
}: {
  label: string
  value: string
  note?: string
  strong?: boolean
  tone?: 'warn' | 'calm'
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className={cn('text-sm', strong ? 'font-medium' : 'text-muted-foreground')}>
        {label}
        {note ? <span className="block text-2xs text-muted-foreground">{note}</span> : null}
      </dt>
      <dd
        className={cn(
          'numeric shrink-0 text-end text-sm',
          strong && 'font-medium',
          tone === 'warn' && 'text-warning',
          tone === 'calm' && 'text-success',
        )}
      >
        {value}
      </dd>
    </div>
  )
}
