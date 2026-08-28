import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { formatDateTime, formatMoney } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { listContracts } from '~/server/contracts'
import {
  attachFineToContract,
  createFine,
  deleteFine,
  listFines,
  settleFine,
  updateFine,
  type FineView,
} from '~/server/fleet'
import { listVehicles } from '~/server/vehicles'
import { Button } from '~/ui/shadcn/button'
import { EmptyState } from '~/ui/feedback/states'
import { Field, FormError, Picker } from '~/ui/forms/fields'
import { toLocalInput } from '~/ui/forms/datetime'
import { textField } from '~/ui/forms/form-data'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'
import { AlertListSkeleton } from '~/ui/skeletons'

/**
 * Amendes.
 *
 * La colonne qui compte est le CONDUCTEUR. Quand le rattachement automatique n'a pas
 * pu trancher, la ligne le dit franchement au lieu d'afficher un nom au hasard :
 * refacturer une contravention au mauvais client coûte un client.
 */
export const Route = createFileRoute('/$lang/app/amendes')({
  loader: async () => ({
    fines: await listFines(),
    vehicles: await listVehicles(),
    contracts: await listContracts(),
  }),
  pendingComponent: AlertListSkeleton,
  component: FinesPage,
})

const STATUS_TONES: Record<string, BadgeVariant> = {
  open: 'warn',
  paid: 'calm',
  contested: 'neutral',
  rebilled: 'accent',
}

function FinesPage() {
  const { t } = useTranslation()
  const { fines, vehicles, contracts } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const target = event.currentTarget
    const raw = textField(form, 'amount').replace(',', '.')
    const amountCents = Math.round(Number(raw) * 100)
    if (!Number.isFinite(amountCents) || amountCents <= 0) return

    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      const result = await createFine({
        data: {
          vehicleId: textField(form, 'vehicleId'),
          offenceAt: new Date(textField(form, 'offenceAt')).toISOString(),
          amountCents,
          location: textField(form, 'location') || undefined,
          referenceNumber: textField(form, 'referenceNumber') || undefined,
          dueOn: textField(form, 'dueOn') || undefined,
        },
      })

      // On dit ce qui s'est passé : rattachée, ambiguë, ou orpheline.
      setNotice(
        result.attachment === 'attached'
          ? t('fine.attached', { reference: '' }).trim()
          : result.attachment === 'ambiguous'
            ? t('fine.ambiguousBody')
            : t('fine.notAttached'),
      )
      target.reset()
      await router.invalidate()
    } catch {
      setError(t('error.genericTitle'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('fine.title')}</h1>
        <span className="numeric text-xs text-muted-foreground">{fines.length}</span>
      </header>

      <form method="post" className="mt-6 grid gap-4 sm:grid-cols-3" onSubmit={(event) => void submit(event)}>
        <Picker
          name="vehicleId"
          label={t('fine.vehicle')}
          required
          options={vehicles.map((vehicle) => ({
            value: vehicle.id,
            label: `${vehicle.plate} — ${vehicle.make} ${vehicle.model}`,
          }))}
        />
        <Field
          name="offenceAt"
          label={t('fine.offenceAt')}
          type="datetime-local"
          required
          hint={t('fine.offenceHint')}
        />
        <Field
          name="amount"
          label={t('fine.amount')}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          required
        />
        <Field name="location" label={t('fine.location')} numeric={false} />
        <Field name="referenceNumber" label={t('fine.reference')} />
        <Field name="dueOn" label={t('fine.dueOn')} type="date" />

        {error ? <FormError>{error}</FormError> : null}
        {notice ? (
          <p className="border-s-2 border-primary ps-3 text-sm text-muted-foreground sm:col-span-3">{notice}</p>
        ) : null}

        <div className="sm:col-span-3">
          <Button type="submit" variant="default" disabled={busy}>
            {busy ? t('auth.working') : t('fine.submit')}
          </Button>
        </div>
      </form>

      {fines.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t('fine.empty')} body={t('fine.emptyBody')} />
        </div>
      ) : (
        <ul className="mt-8 border-t border-border">
          {fines.map((fine) => (
            <FineRow
              key={fine.id}
              fine={fine}
              locale={locale}
              contracts={contracts.filter((contract) => contract.vehicleId === fine.vehicleId)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * CORRECTION D'UNE CONTRAVENTION, dépliée sous sa ligne.
 *
 * Un PV arrive par courrier, souvent mal photocopié : le montant se lit de travers, la
 * date se tape à l'envers. Sans correction possible, la seule issue était de ressaisir
 * — donc de créer un doublon, qui se refacture deux fois au client.
 *
 * Le formulaire s'ouvre SOUS la ligne concernée et non dans une boîte : on corrige en
 * regardant la ligne qu'on corrige.
 */
function EditFineForm({
  fine,
  busy,
  onCancel,
  onSaved,
}: {
  fine: FineView
  busy: boolean
  onCancel: () => void
  onSaved: (action: () => Promise<unknown>) => void
}) {
  const { t } = useTranslation()

  return (
    <form
      method="post"
      className="mt-3 grid w-full gap-4 rounded-lg border border-ring bg-card p-4 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        const raw = textField(form, 'amount').replace(',', '.')
        const amountCents = Math.round(Number(raw) * 100)
        if (!Number.isFinite(amountCents) || amountCents <= 0) return

        onSaved(() =>
          updateFine({
            data: {
              id: fine.id,
              offenceAt: new Date(textField(form, 'offenceAt')).toISOString(),
              amountCents,
              location: textField(form, 'location') || undefined,
              kind: textField(form, 'kind') || undefined,
              referenceNumber: textField(form, 'referenceNumber') || undefined,
              receivedOn: textField(form, 'receivedOn') || undefined,
              dueOn: textField(form, 'dueOn') || undefined,
            },
          }),
        )
      }}
    >
      <Field
        name="offenceAt"
        label={t('fine.offenceAt')}
        type="datetime-local"
        required
        defaultValue={toLocalInput(fine.offenceAt)}
      />
      <Field
        name="amount"
        label={t('fine.amount')}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        required
        defaultValue={String(fine.amountCents / 100)}
      />
      <Field
        name="location"
        label={t('fine.location')}
        numeric={false}
        defaultValue={fine.location ?? ''}
      />
      <Field
        name="referenceNumber"
        label={t('fine.reference')}
        defaultValue={fine.referenceNumber ?? ''}
      />
      <Field
        name="receivedOn"
        label={t('fine.receivedOn')}
        type="date"
        defaultValue={fine.receivedOn ?? ''}
      />
      <Field name="dueOn" label={t('fine.dueOn')} type="date" defaultValue={fine.dueOn ?? ''} />

      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" disabled={busy}>
          {busy ? t('auth.working') : t('fine.saveChanges')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('action.cancel')}
        </Button>
      </div>
    </form>
  )
}

function FineRow({
  fine,
  locale,
  contracts,
}: {
  fine: FineView
  locale: Locale
  contracts: ReadonlyArray<{ id: string; reference: string; customerLabel: string }>
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      setEditing(false)
      setConfirming(false)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3">
      <span className="numeric ledger-margin w-28 sm:w-44 shrink-0 pe-4 text-xs">
        {formatDateTime(fine.offenceAt, locale)}
      </span>
      <span className="text-sm">{fine.vehicleLabel}</span>
      <span className="numeric text-sm">{formatMoney(fine.amountCents, locale)}</span>
      {fine.location ? <span className="text-xs text-muted-foreground">{fine.location}</span> : null}

      <span className="ms-auto flex flex-wrap items-center gap-3">
        {/* Le conducteur, ou l'aveu qu'on ne le connaît pas. */}
        {fine.customerLabel ? (
          <span className="text-sm">
            {fine.customerLabel}{' '}
            <span className="numeric text-xs text-muted-foreground">{fine.contractReference}</span>
          </span>
        ) : (
          <Badge variant="warn">{t('fine.unattached')}</Badge>
        )}

        <Badge variant={STATUS_TONES[fine.status] ?? 'neutral'}>
          {t(`fine.statuses.${fine.status}`)}
        </Badge>

        {fine.contractId === null && contracts.length > 0 ? (
          /*
            Rattacher une amende demande de retrouver un contrat parmi tous ceux qui
            couraient à la date du PV. En liste déroulante, cela veut dire faire
            défiler des références ; en saisie assistée, taper trois lettres du nom du
            client. `layout="inline"` garde le champ à sa place dans la ligne : la
            colonne le nomme déjà, le libellé visible serait redondant.
          */
          <Picker
            name={`contract-${fine.id}`}
            label={t('fine.chooseContract')}
            layout="inline"
            onValueChange={(contractId) => {
              if (contractId)
                void act(() => attachFineToContract({ data: { id: fine.id, contractId } }))
            }}
            options={contracts.map((contract) => ({
              value: contract.id,
              label: contract.customerLabel,
              detail: contract.reference,
            }))}
          />
        ) : null}

        {fine.status === 'open' ? (
          <Button
            disabled={busy}
            onClick={() => void act(() => settleFine({ data: { id: fine.id, status: 'paid' } }))}
          >
            {t('fine.markPaid')}
          </Button>
        ) : null}

        {/*
          Corriger et retirer sont en TEXTE, pas en boutons : la ligne porte déjà deux
          actions métier (encaisser, refacturer), et quatre boutons de même poids ne se
          hiérarchisent plus. Ce qui touche à la SAISIE est secondaire par rapport à ce
          qui touche à l'argent.
        */}
        {confirming ? (
          <>
            <span className="text-2xs text-destructive">{t('fine.confirmDelete')}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act(() => deleteFine({ data: { id: fine.id } }))}
              className="text-2xs font-medium text-destructive underline underline-offset-4 disabled:opacity-45"
            >
              {t('action.delete')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-2xs text-muted-foreground underline underline-offset-4"
            >
              {t('action.cancel')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="text-2xs text-primary underline underline-offset-4"
            >
              {t('action.edit')}
            </button>
            {/* Une amende REFACTURÉE ne se retire pas : le paiement du client existe,
                et le faire disparaître laisserait une recette sans cause. */}
            {fine.status === 'rebilled' ? null : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-2xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
              >
                {t('action.delete')}
              </button>
            )}
          </>
        )}

        {fine.contractId !== null && fine.status !== 'rebilled' ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void act(() =>
                settleFine({ data: { id: fine.id, status: 'rebilled', paidBy: 'customer' } }),
              )
            }
          >
            {t('fine.rebill')}
          </Button>
        ) : null}
      </span>

      {/* Le formulaire s'ouvre SOUS la ligne, en pleine largeur : on corrige en
          regardant la ligne qu'on corrige. */}
      {editing ? (
        <EditFineForm
          fine={fine}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSaved={(action) => void act(action)}
        />
      ) : null}
    </li>
  )
}
