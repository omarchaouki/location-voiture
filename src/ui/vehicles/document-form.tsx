import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DOCUMENT_TYPES, type DocumentType } from '~/core/schemas/document'
import {
  addInspection,
  addInsurance,
  recordRoadTax,
  setRegistration,
  updateInspection,
  updateInsurance,
  updateRegistration,
  updateRoadTax,
} from '~/server/documents'
import { Button } from '~/ui/shadcn/button'
import { Field, FormError } from '~/ui/forms/fields'
import { textField } from '~/ui/forms/form-data'

/**
 * Saisie d'un document du carnet — ajout ET correction.
 *
 * Un seul formulaire, dont les champs changent selon le type : un loueur ajoute une
 * pièce, il ne choisit pas un écran. Les libellés collent aux documents réels —
 * « centre », « numéro de certificat », « vignette <année> ».
 *
 * **Le même composant sert à corriger** depuis le 27/08/2026, et c'est délibérément
 * le même. Un second formulaire d'édition aurait dupliqué quatorze champs, leurs
 * bornes et leurs conversions de centimes ; il aurait divergé au premier changement,
 * et c'est toujours le chemin de CORRECTION qui reste en arrière — celui qu'on
 * regarde le moins. En mode correction, le sélecteur de type disparaît : on ne
 * transforme pas une assurance en vignette.
 */

/** Ce qu'il faut pour pré-remplir une correction. Les valeurs sont déjà en chaînes. */
export interface EditingDocument {
  type: DocumentType
  id: string
  values: Partial<Record<string, string>>
}

/** Centimes → champ en dirhams. `String()` donne la forme la plus courte exacte. */
export function centsToInput(value: number | null): string {
  return value === null ? '' : String(value / 100)
}

export function DocumentForm({
  vehicleId,
  editing,
  onDone,
  onCancel,
}: {
  vehicleId: string
  /** Présent = correction d'une pièce existante. Absent = ajout. */
  editing?: EditingDocument
  onDone?: () => void
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const [chosen, setChosen] = useState<DocumentType>('insurance')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const type = editing?.type ?? chosen
  const initial = editing?.values ?? {}

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
        const values = {
          company: textField(form, 'company'),
          policyNumber: textField(form, 'policyNumber') || undefined,
          startsOn: textField(form, 'startsOn') || undefined,
          expiresOn: textField(form, 'expiresOn'),
          premiumCents: optionalCents(form, 'premium'),
        }
        await (editing
          ? updateInsurance({ data: { id: editing.id, ...values } })
          : addInsurance({ data: { vehicleId, ...values } }))
      } else if (type === 'inspection') {
        const values = {
          centerName: textField(form, 'centerName') || undefined,
          certificateNumber: textField(form, 'certificateNumber') || undefined,
          performedOn: textField(form, 'performedOn'),
          expiresOn: textField(form, 'expiresOn') || undefined,
          result: 'pass' as const,
          costCents: optionalCents(form, 'cost'),
        }
        await (editing
          ? updateInspection({ data: { id: editing.id, ...values } })
          : addInspection({ data: { vehicleId, ...values } }))
      } else if (type === 'roadTax') {
        const values = {
          year: Number(textField(form, 'year')),
          paidAt: textField(form, 'paidAt') || undefined,
          amountCents: optionalCents(form, 'amount'),
          receiptNumber: textField(form, 'receiptNumber') || undefined,
        }
        await (editing
          ? updateRoadTax({ data: { id: editing.id, ...values } })
          : recordRoadTax({ data: { vehicleId, ...values } }))
      } else {
        const values = {
          registrationNumber: textField(form, 'registrationNumber') || undefined,
          firstRegisteredOn: textField(form, 'firstRegisteredOn') || undefined,
          isWw: false,
        }
        await (editing
          ? updateRegistration({ data: { id: editing.id, ...values } })
          : setRegistration({ data: { vehicleId, ...values } }))
      }

      // On ne vide QUE le formulaire d'ajout : effacer une correction réussie
      // remplacerait les valeurs corrigées par du vide sous les yeux de l'utilisateur.
      if (!editing) target.reset()
      await router.invalidate()
      onDone?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const currentYear = new Date().getFullYear()

  return (
    <form
      method="post"
      onSubmit={(event) => void submit(event)}
      className={editing ? '' : 'border-t border-border pt-6'}
    >
      {/*
        Sélecteur segmenté : quatre types de pièce, tous visibles d'un coup. Un
        `<select>` les cacherait, et le formulaire change ENTIÈREMENT selon le choix —
        c'est une navigation, pas un champ. Absent en correction : le type est acquis.
      */}
      {editing ? null : (
        <fieldset className="inline-flex flex-wrap overflow-hidden rounded-lg border border-input">
          <legend className="sr-only">{t('vehicle.file.documentType')}</legend>
          {DOCUMENT_TYPES.map((option) => (
            <label
              key={option}
              style={{ minHeight: 'var(--tap-target)' }}
              className={`flex cursor-pointer items-center border-s border-border px-4 text-xs font-medium transition-colors first:border-s-0 ${
                type === option
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <input
                type="radio"
                name="documentType"
                className="sr-only"
                checked={type === option}
                onChange={() => setChosen(option)}
              />
              {t(labelKeyOf(option))}
            </label>
          ))}
        </fieldset>
      )}

      <div className={`grid gap-4 sm:grid-cols-2 ${editing ? '' : 'mt-5'}`}>
        {type === 'insurance' ? (
          <>
            <Field
              name="company"
              label={t('vehicle.file.company')}
              numeric={false}
              required
              defaultValue={initial['company'] ?? ''}
            />
            <Field
              name="policyNumber"
              label={t('vehicle.file.policyNumber')}
              defaultValue={initial['policyNumber'] ?? ''}
            />
            <Field
              name="startsOn"
              label={t('vehicle.file.startsOn')}
              type="date"
              defaultValue={initial['startsOn'] ?? ''}
            />
            <Field
              name="expiresOn"
              label={t('vehicle.file.expiresOnField')}
              type="date"
              required
              defaultValue={initial['expiresOn'] ?? ''}
            />
            <Field
              name="premium"
              label={t('vehicle.file.premium')}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={initial['premium'] ?? ''}
            />
          </>
        ) : null}

        {type === 'inspection' ? (
          <>
            <Field
              name="centerName"
              label={t('vehicle.file.center')}
              numeric={false}
              defaultValue={initial['centerName'] ?? ''}
            />
            <Field
              name="certificateNumber"
              label={t('vehicle.file.certificate')}
              defaultValue={initial['certificateNumber'] ?? ''}
            />
            <Field
              name="performedOn"
              label={t('vehicle.file.performedOn')}
              type="date"
              required
              defaultValue={initial['performedOn'] ?? ''}
            />
            {/* Laissée vide, l'échéance est calculée à 12 mois côté serveur (É4). */}
            <Field
              name="expiresOn"
              label={t('vehicle.file.expiresOnField')}
              type="date"
              defaultValue={initial['expiresOn'] ?? ''}
            />
            <Field
              name="cost"
              label={t('vehicle.file.amount')}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={initial['cost'] ?? ''}
            />
          </>
        ) : null}

        {type === 'roadTax' ? (
          <>
            <Field
              name="year"
              label={t('vehicle.file.year')}
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              required
              defaultValue={initial['year'] ?? String(currentYear)}
            />
            <Field
              name="paidAt"
              label={t('vehicle.file.paidAt')}
              type="date"
              defaultValue={initial['paidAt'] ?? ''}
            />
            <Field
              name="amount"
              label={t('vehicle.file.amount')}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              defaultValue={initial['amount'] ?? ''}
            />
            <Field
              name="receiptNumber"
              label={t('vehicle.file.certificate')}
              defaultValue={initial['receiptNumber'] ?? ''}
            />
          </>
        ) : null}

        {type === 'registration' ? (
          <>
            <Field
              name="registrationNumber"
              label={t('vehicle.file.registrationNumber')}
              defaultValue={initial['registrationNumber'] ?? ''}
            />
            <Field
              name="firstRegisteredOn"
              label={t('vehicle.file.firstRegisteredOn')}
              type="date"
              defaultValue={initial['firstRegisteredOn'] ?? ''}
            />
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {t('vehicle.file.registrationNoExpiry')}
            </p>
          </>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="default" disabled={busy}>
          {busy ? t('auth.working') : editing ? t('vehicle.file.saveChanges') : t('vehicle.file.save')}
        </Button>
        {editing && onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('vehicle.file.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function labelKeyOf(type: DocumentType): string {
  return type === 'registration' ? 'entity.registration' : `deadline.${type}`
}
