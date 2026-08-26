import { useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { priceRental, type SignatureBlock } from '~/core/rental'
import { DEPOSIT_METHODS } from '~/core/schemas/rental'
import { formatMoney } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { checkContractSignature, createContract } from '~/server/contracts'
import { listCustomers } from '~/server/customers'
import { listVehicles } from '~/server/vehicles'
import { Field, FormError, Picker, Select } from '~/ui/forms/fields'
import { choiceField, textField } from '~/ui/forms/form-data'
import { BUTTON_STYLE, Button, buttonClasses } from '~/ui/primitives/button'
import { Stamp } from '~/ui/primitives/stamp'

/**
 * Nouveau contrat.
 *
 * Les blocages sont vérifiés AVANT la soumission et affichés en clair : un agent au
 * comptoir doit savoir tout de suite que le permis est expiré, pas après avoir rempli
 * douze champs. La vérification est refaite côté serveur — c'est elle qui fait foi.
 */
export const Route = createFileRoute('/$lang/app/contrats/nouveau')({
  loader: async () => ({
    vehicles: await listVehicles(),
    customers: await listCustomers(),
  }),
  component: NewContractPage,
})

function cents(form: FormData, name: string): number | undefined {
  const raw = textField(form, name).replace(',', '.')
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined
}

/** `datetime-local` rend une heure locale sans fuseau : on la convertit en ISO UTC. */
function instant(form: FormData, name: string): string {
  const raw = textField(form, name)
  return raw === '' ? new Date().toISOString() : new Date(raw).toISOString()
}

function NewContractPage() {
  const { t } = useTranslation()
  const { vehicles, customers } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const navigate = useNavigate()

  const formRef = useRef<HTMLFormElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<SignatureBlock[]>([])
  const [overridable, setOverridable] = useState(false)
  const [preview, setPreview] = useState<{ days: number; total: number } | null>(null)

  /** Vérification à la volée : blocages et prix, sans rien écrire. */
  async function refresh(form: HTMLFormElement) {
    const data = new FormData(form)
    const vehicleId = textField(data, 'vehicleId')
    const customerId = textField(data, 'customerId')
    if (!vehicleId || !customerId) return

    const startAt = instant(data, 'plannedStartAt')
    const endAt = instant(data, 'plannedEndAt')

    const vehicle = vehicles.find((candidate) => candidate.id === vehicleId)
    const dailyCents = cents(data, 'dailyCents') ?? vehicle?.dailyCents ?? 0
    const pricing = priceRental({
      startAt,
      endAt,
      dailyCents,
      ...(cents(data, 'discountCents') === undefined
        ? {}
        : { discountCents: cents(data, 'discountCents')! }),
    })
    setPreview({ days: pricing.daysBilled, total: pricing.totalCents })

    const result = await checkContractSignature({
      data: { vehicleId, customerId, plannedStartAt: startAt, plannedEndAt: endAt },
    })
    setBlocks(result.blocks)
    setOverridable(result.overridable)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)

    try {
      const created = await createContract({
        data: {
          vehicleId: textField(form, 'vehicleId'),
          customerId: textField(form, 'customerId'),
          plannedStartAt: instant(form, 'plannedStartAt'),
          plannedEndAt: instant(form, 'plannedEndAt'),
          dailyCents: cents(form, 'dailyCents'),
          discountCents: cents(form, 'discountCents'),
          extrasCents: cents(form, 'extrasCents'),
          depositCents: cents(form, 'depositCents'),
          depositMethod: choiceField(form, 'depositMethod', DEPOSIT_METHODS, 'cash'),
          override: textField(form, 'override') || undefined,
        },
      })
      await navigate({
        to: '/$lang/app/contrats/$contractId',
        params: { lang: locale, contractId: created.id },
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.genericTitle'))
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="flex flex-wrap items-baseline gap-x-4 border-b-2 border-rule-strong pb-3">
        <h1 className="font-display text-2xl">{t('contract.add')}</h1>
        <span className="ms-auto">
          <Link
            to="/$lang/app/contrats"
            params={{ lang: locale }}
            className={buttonClasses('ghost')}
            style={BUTTON_STYLE}
          >
            <span>{t('contract.back')}</span>
          </Link>
        </span>
      </header>

      <form
        method="post"
        ref={formRef}
        className="mt-8 grid gap-5 sm:grid-cols-2"
        onSubmit={(event) => void submit(event)}
        onChange={(event) => void refresh(event.currentTarget)}
      >
        {/*
          Le choix d'un véhicule ou d'un client passe par un champ CACHÉ, dont React
          change la valeur sans émettre d'événement `change`. Le `onChange` du
          formulaire ne le verrait donc jamais, et l'aperçu de prix resterait figé sur
          le véhicule précédent — un tarif faux affiché avec aplomb. D'où le rappel
          explicite, via une référence au formulaire.
        */}
        <Picker
          name="vehicleId"
          label={t('contract.vehicle')}
          required
          onValueChange={() => {
            if (formRef.current) void refresh(formRef.current)
          }}
          options={vehicles.map((vehicle) => ({
            value: vehicle.id,
            label: `${vehicle.make} ${vehicle.model}`,
            detail: vehicle.plate,
          }))}
        />
        <Picker
          name="customerId"
          label={t('contract.customer')}
          required
          onValueChange={() => {
            if (formRef.current) void refresh(formRef.current)
          }}
          options={customers.map((customer) => ({ value: customer.id, label: customer.label }))}
        />

        <Field name="plannedStartAt" label={t('contract.start')} type="datetime-local" required />
        <Field name="plannedEndAt" label={t('contract.end')} type="datetime-local" required />

        <Field name="dailyCents" label={t('contract.dailyRate')} type="number" />
        <Field name="discountCents" label={t('contract.discount')} type="number" />
        <Field name="extrasCents" label={t('contract.extras')} type="number" />
        <Field name="depositCents" label={t('contract.deposit')} type="number" />
        <Select
          name="depositMethod"
          label={t('contract.depositMethod')}
          options={DEPOSIT_METHODS}
          prefix="contract.depositMethods"
        />

        {preview ? (
          <p className="numeric border-t border-rule pt-3 text-sm sm:col-span-2">
            {preview.days} {t('contract.days')} · {t('contract.total')}{' '}
            {formatMoney(preview.total, locale)}
          </p>
        ) : null}

        {/* Les blocages sont montrés TOUS ensemble, pas un par un. */}
        {blocks.length > 0 ? (
          <div className="border-s-2 border-danger ps-3 sm:col-span-2">
            <p className="font-medium text-danger">{t('contract.blocked')}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {blocks.map((block) => (
                <li key={block.reason}>
                  <Stamp tone="danger">{t(`contract.blocks.${block.reason}`)}</Stamp>
                </li>
              ))}
            </ul>
            {overridable ? (
              <div className="mt-4">
                <Field name="override" label={t('contract.override')} numeric={false} />
                <p className="mt-1 text-2xs text-muted">{t('contract.overrideHint')}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <FormError>{error}</FormError> : null}

        <div className="sm:col-span-2">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || (blocks.length > 0 && !overridable)}
          >
            {busy ? t('auth.working') : t('contract.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}
