import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DOCUMENT_TYPES, type DocumentType } from '~/core/schemas/document'
import { addInspection, addInsurance, recordRoadTax, setRegistration } from '~/server/documents'
import { textField } from '~/ui/forms/form-data'
import { Button } from '~/ui/primitives/button'

/**
 * Ajout d'un document au carnet.
 *
 * Un seul formulaire, dont les champs changent selon le type : un loueur ajoute une
 * pièce, il ne choisit pas un écran. Les libellés collent aux documents réels —
 * « centre », « numéro de certificat », « vignette <année> ».
 */
export function DocumentForm({ vehicleId }: { vehicleId: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const [type, setType] = useState<DocumentType>('insurance')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function optionalCents(form: FormData, name: string): number | undefined {
    const raw = textField(form, name).replace(',', '.')
    if (raw === '') return undefined
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const target = event.currentTarget
    setBusy(true)
    setError(null)

    try {
      if (type === 'insurance') {
        await addInsurance({
          data: {
            vehicleId,
            company: textField(form, 'company'),
            policyNumber: textField(form, 'policyNumber') || undefined,
            startsOn: textField(form, 'startsOn') || undefined,
            expiresOn: textField(form, 'expiresOn'),
            premiumCents: optionalCents(form, 'premium'),
          },
        })
      } else if (type === 'inspection') {
        await addInspection({
          data: {
            vehicleId,
            centerName: textField(form, 'centerName') || undefined,
            certificateNumber: textField(form, 'certificateNumber') || undefined,
            performedOn: textField(form, 'performedOn'),
            expiresOn: textField(form, 'expiresOn') || undefined,
            result: 'pass',
            costCents: optionalCents(form, 'cost'),
          },
        })
      } else if (type === 'roadTax') {
        await recordRoadTax({
          data: {
            vehicleId,
            year: Number(textField(form, 'year')),
            paidAt: textField(form, 'paidAt') || undefined,
            amountCents: optionalCents(form, 'amount'),
            receiptNumber: textField(form, 'receiptNumber') || undefined,
          },
        })
      } else {
        await setRegistration({
          data: {
            vehicleId,
            registrationNumber: textField(form, 'registrationNumber') || undefined,
            firstRegisteredOn: textField(form, 'firstRegisteredOn') || undefined,
            isWw: false,
          },
        })
      }

      target.reset()
      await router.invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const currentYear = new Date().getFullYear()

  return (
    <form method="post" onSubmit={(event) => void submit(event)} className="border-t border-rule pt-6">
      <fieldset className="flex flex-wrap items-center gap-0 border border-rule">
        <legend className="sr-only">{t('vehicle.file.documentType')}</legend>
        {DOCUMENT_TYPES.map((option) => (
          <label
            key={option}
            style={{ minHeight: 'var(--tap-target)' }}
            className={`flex cursor-pointer items-center px-3 text-2xs tracking-wide uppercase ${
              type === option ? 'bg-stamp text-stamp-contrast' : 'text-muted hover:text-ink'
            }`}
          >
            <input
              type="radio"
              name="documentType"
              className="sr-only"
              checked={type === option}
              onChange={() => setType(option)}
            />
            {t(labelKeyOf(option))}
          </label>
        ))}
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {type === 'insurance' ? (
          <>
            <Field name="company" label={t('vehicle.file.company')} required />
            <Field name="policyNumber" label={t('vehicle.file.policyNumber')} />
            <Field name="startsOn" label={t('vehicle.file.startsOn')} type="date" />
            <Field name="expiresOn" label={t('vehicle.file.expiresOnField')} type="date" required />
            <Field name="premium" label={t('vehicle.file.premium')} type="number" />
          </>
        ) : null}

        {type === 'inspection' ? (
          <>
            <Field name="centerName" label={t('vehicle.file.center')} />
            <Field name="certificateNumber" label={t('vehicle.file.certificate')} />
            <Field name="performedOn" label={t('vehicle.file.performedOn')} type="date" required />
            {/* Laissée vide, l'échéance est calculée à 12 mois côté serveur (É4). */}
            <Field name="expiresOn" label={t('vehicle.file.expiresOnField')} type="date" />
            <Field name="cost" label={t('vehicle.file.amount')} type="number" />
          </>
        ) : null}

        {type === 'roadTax' ? (
          <>
            <Field
              name="year"
              label={t('vehicle.file.year')}
              type="number"
              required
              defaultValue={String(currentYear)}
            />
            <Field name="paidAt" label={t('vehicle.file.paidAt')} type="date" />
            <Field name="amount" label={t('vehicle.file.amount')} type="number" />
            <Field name="receiptNumber" label={t('vehicle.file.certificate')} />
          </>
        ) : null}

        {type === 'registration' ? (
          <>
            <Field name="registrationNumber" label={t('vehicle.file.registrationNumber')} />
            <Field
              name="firstRegisteredOn"
              label={t('vehicle.file.firstRegisteredOn')}
              type="date"
            />
            <p className="text-xs text-muted sm:col-span-2">
              {t('vehicle.file.registrationNoExpiry')}
            </p>
          </>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 border-s-2 border-danger ps-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? t('auth.working') : t('vehicle.file.save')}
        </Button>
      </div>
    </form>
  )
}

function labelKeyOf(type: DocumentType): string {
  return type === 'registration' ? 'entity.registration' : `deadline.${type}`
}

function Field({
  name,
  label,
  type = 'text',
  required,
  defaultValue,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  defaultValue?: string
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="numeric mt-1 block w-full border border-rule-strong bg-surface px-3 py-2 text-base"
        style={{ minHeight: 'var(--tap-target)' }}
      />
    </label>
  )
}
