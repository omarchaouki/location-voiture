import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { PAYMENT_METHODS } from '~/core/schemas/rental'
import { formatDateTime, formatMoney } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import {
  cancelContract,
  getContract,
  recordPayment,
  returnContract,
  startContract,
  updateContract,
} from '~/server/contracts'
import { Button, buttonVariants } from '~/ui/shadcn/button'
import { toLocalInput } from '~/ui/forms/datetime'
import { Field, FormError, Select } from '~/ui/forms/fields'
import { PrintButton, PrintHeader } from '~/ui/print/printable'
import { ReturnPanel } from '~/ui/rental/return-panel'
import { choiceField, textField } from '~/ui/forms/form-data'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'
import { VehicleFileSkeleton } from '~/ui/skeletons'

/**
 * Fiche contrat.
 *
 * Le contrat est un document : référence en tête, parties, période, montants, et les
 * actions du jour au bas. Chaque action correspond à un geste réel du comptoir —
 * remettre les clés, récupérer la voiture, encaisser.
 */
export const Route = createFileRoute('/$lang/app/contrats/$contractId')({
  loader: async ({ params }) => ({ file: await getContract({ data: { id: params.contractId } }) }),
  pendingComponent: VehicleFileSkeleton,
  component: ContractPage,
})

const STATUS_TONES: Record<string, BadgeVariant> = {
  reservation: 'neutral',
  active: 'accent',
  returned: 'calm',
  late: 'danger',
  cancelled: 'neutral',
}

function cents(form: FormData, name: string): number | undefined {
  const raw = textField(form, name).replace(',', '.')
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined
}

function ContractPage() {
  const { t } = useTranslation()
  const { file } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const contract = file.contract
  const remaining = contract.totalCents - file.paidCents

  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await router.invalidate()
    } catch (cause) {
      /*
        Chaque refus MÉTIER est nommé. « Une erreur est survenue » sur un compteur en
        recul ou un retour antérieur au départ envoie l'utilisateur au support pour un
        message qu'on sait écrire.
      */
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(
        /OdometerInconsistent|below start km/.test(message)
          ? t('contract.odometerBackwards')
          : /not editable in status/.test(message)
            ? t('contract.notEditable')
            : /endBeforeStart/.test(message)
              ? t('contract.endBeforeStart')
              : t('error.genericTitle'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl">
      {/*
        L'en-tête PAPIER. Un contrat imprimé se signe au comptoir puis quitte
        l'application : il doit porter l'agence, son objet et sa date, qu'aucune barre
        latérale ne lui donnera plus.
      */}
      <PrintHeader
        organization={t('brand.name')}
        title={t('contract.printTitle')}
        reference={contract.reference}
        printedOn={formatDateTime(new Date().toISOString(), locale)}
      />

      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-border pb-3">
        <span className="numeric text-2xl">{contract.reference}</span>
        <Badge variant={STATUS_TONES[contract.status] ?? 'neutral'}>
          {t(`contract.statuses.${contract.status}`)}
        </Badge>
        <span className="ms-auto flex flex-wrap items-center gap-3">
          <PrintButton label={t('contract.print')} />
          <Link
            to="/$lang/app/contrats"
            params={{ lang: locale }}
            data-print="hide"
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('contract.back')}</span>
          </Link>
        </span>
      </header>

      {/* --- Les parties et la période, comme sur un contrat papier. --- */}
      <dl className="mt-6 grid gap-px bg-border sm:grid-cols-2">
        <Row label={t('contract.customer')} value={file.customerLabel} />
        <Row label={t('contract.vehicle')} value={file.vehicleLabel} />
        <Row
          label={t('contract.start')}
          value={formatDateTime(contract.plannedStartAt, locale)}
          numeric
        />
        <Row
          label={t('contract.end')}
          value={formatDateTime(contract.plannedEndAt, locale)}
          numeric
        />
        {contract.actualStartAt ? (
          <Row
            label={t('contract.startedAt')}
            value={formatDateTime(contract.actualStartAt, locale)}
            numeric
          />
        ) : null}
        {contract.actualEndAt ? (
          <Row
            label={t('contract.returnedAt')}
            value={formatDateTime(contract.actualEndAt, locale)}
            numeric
          />
        ) : null}
        {/* La date de restitution de la caution : une date se lit avec les dates, pas
            au milieu d'une colonne de montants. Absente tant que la caution n'est pas
            rendue — c'est ce vide que l'alerte `deposit.pending` vient combler. */}
        {contract.depositReturnedAt ? (
          <Row
            label={t('contract.settlement.depositReturnedOn')}
            value={formatDateTime(contract.depositReturnedAt, locale)}
            numeric
          />
        ) : null}
      </dl>

      {/* --- Les montants, en chiffres tabulaires alignés. --- */}
      <dl className="mt-8 border-t border-border">
        <Money label={`${contract.daysBilled} ${t('contract.days')}`} value={contract.subtotalCents} locale={locale} />
        <Money label={t('contract.vat')} value={contract.vatCents} locale={locale} />
        <Money label={t('contract.total')} value={contract.totalCents} locale={locale} strong />
        <Money label={t('contract.paid')} value={file.paidCents} locale={locale} />
        {remaining > 0 ? (
          <Money label={t('contract.remaining')} value={remaining} locale={locale} warn />
        ) : null}
        {contract.depositCents > 0 ? (
          <Money label={t('contract.deposit')} value={contract.depositCents} locale={locale} />
        ) : null}

        {/*
          LE SORT DE LA CAUTION, une fois la voiture rendue.
          Il reste sur la fiche — et sur le contrat imprimé — parce que c'est la ligne
          qu'on ressort quand un client rappelle trois semaines plus tard pour demander
          où sont passés ses 500 dirhams.
        */}
        {contract.status === 'returned' && contract.depositCents > 0 ? (
          <>
            {contract.depositWithheldCents > 0 ? (
              <Money
                label={t('contract.withheldOn')}
                value={contract.depositWithheldCents}
                locale={locale}
                warn
              />
            ) : null}
            <Money
              label={t('contract.settlement.dueBack')}
              value={contract.depositCents - contract.depositWithheldCents}
              locale={locale}
              strong
            />
          </>
        ) : null}
      </dl>

      {error ? (
        <div className="mt-6">
          <FormError>{error}</FormError>
        </div>
      ) : null}

      {/*
        CORRECTION DU CONTRAT.

        Un tarif négocié après coup, une remise oubliée, un retour repoussé de deux
        jours : sans cet écran, la seule issue était d'annuler et de ressaisir — ce qui
        casse la numérotation continue et perd les paiements déjà reçus.

        La date de DÉBUT disparaît une fois le véhicule parti : c'est un fait constaté
        au comptoir, pas une intention. Les montants sont recalculés au serveur ; ce
        formulaire n'envoie jamais un total.
      */}
      {contract.status === 'returned' || contract.status === 'cancelled' ? null : (
        <ContractEditor contract={contract} busy={busy} onSubmit={(action) => void act(action)} />
      )}

      {/* --- Les gestes du comptoir. --- */}
      {contract.status === 'reservation' ? (
        <form method="post"
          data-print="hide"
          className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void act(() =>
              startContract({
                data: {
                  id: contract.id,
                  startKm: Number(textField(form, 'startKm')),
                  startFuelEighths: Number(textField(form, 'startFuelEighths')),
                },
              }),
            )
          }}
        >
          <Field name="startKm" label={t('contract.startKm')} type="number" required />
          <Field name="startFuelEighths" label={t('contract.fuel')} type="number" required defaultValue="8" />
          <div className="sm:col-span-2">
            <Button type="submit" variant="default" disabled={busy}>
              {busy ? t('auth.working') : t('contract.startAction')}
            </Button>
          </div>
        </form>
      ) : null}

      {/*
        LE RETOUR. Quatre champs nus auparavant, dont une « retenue sur caution » que
        l'agent calculait de tête devant le client. Le panneau montre le décompte
        pendant la saisie — et n'envoie toujours que des constats, jamais un total.
      */}
      {contract.status === 'active' || contract.status === 'late' ? (
        <ReturnPanel
          contract={contract}
          paidCents={file.paidCents}
          locale={locale}
          busy={busy}
          onSubmit={(submission) =>
            void act(() => returnContract({ data: { id: contract.id, ...submission } }))
          }
        />
      ) : null}

      {/* --- Encaissement, tant qu'il reste quelque chose à payer. --- */}
      {remaining > 0 && contract.status !== 'cancelled' ? (
        <form method="post"
          data-print="hide"
          className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const amount = cents(form, 'amount')
            if (!amount) return
            const target = event.currentTarget
            void act(async () => {
              await recordPayment({
                data: {
                  contractId: contract.id,
                  amountCents: amount,
                  method: choiceField(form, 'method', PAYMENT_METHODS, 'cash'),
                },
              })
              target.reset()
            })
          }}
        >
          <Field name="amount" label={t('contract.amount')} type="number" required />
          <Select
            name="method"
            label={t('contract.method')}
            options={PAYMENT_METHODS}
            prefix="contract.paymentMethods"
          />
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              {t('contract.addPayment')}
            </Button>
          </div>
        </form>
      ) : null}

      {contract.status === 'reservation' || contract.status === 'active' ? (
        <form method="post"
          data-print="hide"
          className="mt-8 flex flex-wrap items-end gap-4 border-t border-border pt-6"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void act(() =>
              cancelContract({
                data: { id: contract.id, reason: textField(form, 'reason') },
              }),
            )
          }}
        >
          <span className="min-w-60 flex-1">
            <Field name="reason" label={t('contract.cancelReason')} numeric={false} required />
          </span>
          <Button type="submit" variant="destructive" disabled={busy}>
            {t('contract.cancelAction')}
          </Button>
        </form>
      ) : null}
    </div>
  )
}

function Row({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-sm${numeric ? ' numeric' : ''}`}>{value}</dd>
    </div>
  )
}

function Money({
  label,
  value,
  locale,
  strong,
  warn,
}: {
  label: string
  value: number
  locale: 'fr' | 'ar' | 'en'
  strong?: boolean
  warn?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-2">
      <dt className={`text-sm${strong ? ' font-medium' : ' text-muted-foreground'}`}>{label}</dt>
      <dd
        className={`numeric text-sm${strong ? ' font-medium' : ''}${warn ? ' text-warning' : ''}`}
      >
        {formatMoney(value, locale)}
      </dd>
    </div>
  )
}


/**
 * L'éditeur, replié tant qu'on ne le demande pas.
 *
 * Déplié par défaut, il pousserait les actions du jour — démarrer, restituer,
 * encaisser — sous la ligne de flottaison. Or corriger un contrat est rare ; le
 * démarrer l'est beaucoup moins.
 */
function ContractEditor({
  contract,
  busy,
  onSubmit,
}: {
  contract: {
    id: string
    status: string
    actualStartAt: string | null
    plannedStartAt: string
    plannedEndAt: string
    dailyCents: number
    discountCents: number
    extrasCents: number
    depositCents: number
  }
  busy: boolean
  onSubmit: (action: () => Promise<unknown>) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const started = contract.actualStartAt !== null

  if (!open) {
    return (
      <div data-print="hide" className="mt-8 border-t border-border pt-6">
        <Button variant="outline" onClick={() => setOpen(true)}>
          {t('contract.editTitle')}
        </Button>
      </div>
    )
  }

  return (
    <form
      method="post"
      data-print="hide"
      className="mt-8 grid gap-4 border-t border-border pt-6 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        onSubmit(() =>
          updateContract({
            data: {
              id: contract.id,
              ...(started
                ? {}
                : { plannedStartAt: new Date(textField(form, 'plannedStartAt')).toISOString() }),
              plannedEndAt: new Date(textField(form, 'plannedEndAt')).toISOString(),
              dailyCents: cents(form, 'dailyRate'),
              discountCents: cents(form, 'discount'),
              extrasCents: cents(form, 'extras'),
              depositCents: cents(form, 'deposit'),
            },
          }),
        )
      }}
    >
      <h2 className="text-base sm:col-span-2">{t('contract.editTitle')}</h2>

      {started ? (
        <p className="text-xs text-muted-foreground sm:col-span-2">{t('contract.startLocked')}</p>
      ) : (
        <Field
          name="plannedStartAt"
          label={t('contract.start')}
          type="datetime-local"
          required
          defaultValue={toLocalInput(contract.plannedStartAt)}
        />
      )}

      <Field
        name="plannedEndAt"
        label={t('contract.end')}
        type="datetime-local"
        required
        defaultValue={toLocalInput(contract.plannedEndAt)}
      />
      <Field
        name="dailyRate"
        label={t('contract.dailyRate')}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        defaultValue={String(contract.dailyCents / 100)}
      />
      <Field
        name="discount"
        label={t('contract.discount')}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        defaultValue={String(contract.discountCents / 100)}
      />
      <Field
        name="extras"
        label={t('contract.extras')}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        defaultValue={String(contract.extrasCents / 100)}
      />
      <Field
        name="deposit"
        label={t('contract.deposit')}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        defaultValue={String(contract.depositCents / 100)}
      />

      <p className="text-xs text-muted-foreground sm:col-span-2">{t('contract.editRecomputed')}</p>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? t('auth.working') : t('contract.saveChanges')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {t('action.cancel')}
        </Button>
      </div>
    </form>
  )
}
