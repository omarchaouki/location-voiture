import { useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDate, formatKilometers } from '~/i18n/format'
import type { Locale } from '~/i18n/locales'
import { createSchedule, recordMaintenance, updateSchedule } from '~/server/fleet'
import { Field } from '~/ui/forms/fields'
import { textField } from '~/ui/forms/form-data'
import { OilCanIcon } from '~/ui/icons'
import { Badge, type BadgeVariant } from '~/ui/shadcn/badge'
import { Button } from '~/ui/shadcn/button'

/**
 * LA VIDANGE — l'échéance que tout loueur suit, et que le produit ne savait pas régler.
 *
 * Les tables étaient là depuis la Phase 3 (`maintenance_schedules`,
 * `maintenance_records`), le calcul aussi (`nextMaintenanceDue`), et la frise du carnet
 * affichait déjà « vidange dans 500 km ». Il manquait le seul bout qui compte au
 * comptoir : un endroit pour dire tous les combien elle revient, et pour enregistrer
 * celle qu'on vient de faire. Sans lui, le programme ne pouvait se poser que par un
 * appel d'API — c'est-à-dire par personne.
 *
 * **Deux seuils, et l'échéance tombe au PREMIER atteint.** C'est la règle du métier et
 * elle est déjà dans le domaine : 10 000 km OU 12 mois, selon ce qui arrive d'abord.
 * Une voiture de location fait ses 10 000 km en quatre mois ; une voiture de remplacement
 * qui dort au parc atteint ses 12 mois bien avant son kilométrage. Ne suivre que les
 * kilomètres laisse la seconde sans vidange pendant deux ans.
 *
 * **Ce panneau n'affiche AUCUNE date qu'il aurait calculée lui-même.** `nextDueOn` et
 * `nextDueKm` sont dénormalisés en base, recalculés à chaque écriture par le serveur,
 * et c'est ce que balaie le moteur d'alertes. Un second calcul ici finirait par dire
 * autre chose que la pastille d'alerte, et c'est celle-là qu'on croirait.
 */

/** Le programme d'entretien tel que la fiche véhicule le reçoit. */
export interface MaintenanceSchedule {
  id: string
  kind: string
  intervalKm: number | null
  intervalMonths: number | null
  lastDoneOn: string | null
  lastDoneKm: number | null
  nextDueOn: string | null
  nextDueKm: number | null
  isActive: boolean
}

/**
 * Valeurs de départ d'une vidange, proposées à la création.
 *
 * 10 000 km et 12 mois : c'est l'intervalle courant d'une huile semi-synthétique sur
 * le parc marocain. Une PROPOSITION, jamais une contrainte — les deux champs sont
 * modifiables avant d'enregistrer, et chaque agence a son garage et son avis.
 */
const DEFAULT_OIL_KM = 10_000
const DEFAULT_OIL_MONTHS = 12

/**
 * L'état de l'échéance, en trois tons.
 *
 * Le seuil de 500 km est le même que celui de la frise du carnet : deux seuils
 * différents pour la même échéance donneraient un badge orange à côté d'une frise
 * verte, et il faudrait alors choisir lequel croire.
 */
const SOON_KM = 500

function toneOf(
  schedule: MaintenanceSchedule,
  currentKm: number,
  today: string,
): { tone: BadgeVariant; key: 'due' | 'soon' | 'ok' } {
  const kmLeft = schedule.nextDueKm === null ? null : schedule.nextDueKm - currentKm
  const overdue =
    (kmLeft !== null && kmLeft <= 0) ||
    (schedule.nextDueOn !== null && schedule.nextDueOn <= today)
  if (overdue) return { tone: 'danger', key: 'due' }
  if (kmLeft !== null && kmLeft <= SOON_KM) return { tone: 'warn', key: 'soon' }
  return { tone: 'calm', key: 'ok' }
}

/** Saisie facultative d'un entier. Vide = « non renseigné », jamais zéro. */
function optionalInt(form: FormData, name: string): number | undefined {
  const raw = textField(form, name).trim()
  if (raw === '') return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

/** Dirhams saisis à la virgule ou au point, stockés en centimes entiers. */
function optionalCents(form: FormData, name: string): number | undefined {
  const raw = textField(form, name).replace(',', '.').trim()
  if (raw === '') return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined
}

export function MaintenancePanel({
  vehicleId,
  currentKm,
  today,
  schedules,
  locale,
  canWrite,
}: {
  vehicleId: string
  currentKm: number
  today: string
  schedules: readonly MaintenanceSchedule[]
  locale: Locale
  canWrite: boolean
}) {
  const { t } = useTranslation()
  const router = useRouter()

  const oil = schedules.find((schedule) => schedule.kind === 'oil_change' && schedule.isActive)
  const [mode, setMode] = useState<'interval' | 'record' | null>(null)
  const [busy, setBusy] = useState(false)

  async function saveInterval(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const intervalKm = optionalInt(form, 'intervalKm')
    const intervalMonths = optionalInt(form, 'intervalMonths')

    setBusy(true)
    try {
      /*
       * Créer ou corriger, selon qu'un programme existe — et non deux boutons.
       *
       * L'agent qui ouvre cette fiche veut « régler la vidange » ; savoir si la ligne
       * existe déjà en base est notre affaire, pas la sienne.
       */
      if (oil) {
        await updateSchedule({
          data: {
            id: oil.id,
            intervalKm: intervalKm ?? null,
            intervalMonths: intervalMonths ?? null,
          },
        })
      } else {
        await createSchedule({
          data: {
            vehicleId,
            kind: 'oil_change',
            ...(intervalKm === undefined ? {} : { intervalKm }),
            ...(intervalMonths === undefined ? {} : { intervalMonths }),
          },
        })
      }
      setMode(null)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  async function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    setBusy(true)
    try {
      await recordMaintenance({
        data: {
          vehicleId,
          kind: 'oil_change',
          ...(oil === undefined ? {} : { scheduleId: oil.id }),
          performedOn: textField(form, 'performedOn'),
          ...(optionalInt(form, 'km') === undefined ? {} : { km: optionalInt(form, 'km')! }),
          ...(textField(form, 'garageName').trim() === ''
            ? {}
            : { garageName: textField(form, 'garageName').trim() }),
          ...(optionalCents(form, 'parts') === undefined
            ? {}
            : { partsCents: optionalCents(form, 'parts')! }),
          ...(optionalCents(form, 'labour') === undefined
            ? {}
            : { labourCents: optionalCents(form, 'labour')! }),
        },
      })
      setMode(null)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  const state = oil ? toneOf(oil, currentKm, today) : null

  return (
    <section className="mt-12" data-print="hide">
      <h2 className="mb-4 flex flex-wrap items-center gap-3 border-b border-border pb-2 text-lg">
        <OilCanIcon size={20} />
        <span>{t('maintenance.oilTitle')}</span>
        {state === null ? null : (
          <Badge variant={state.tone}>{t(`maintenance.state.${state.key}`)}</Badge>
        )}
      </h2>

      {oil === undefined ? (
        <p className="text-sm text-muted-foreground">{t('maintenance.oilNone')}</p>
      ) : (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5">
            <dt className="text-xs text-muted-foreground">{t('maintenance.interval')}</dt>
            <dd className="numeric">
              {[
                oil.intervalKm === null
                  ? null
                  : `${formatKilometers(oil.intervalKm, locale)} km`,
                oil.intervalMonths === null
                  ? null
                  : t('maintenance.months', { count: oil.intervalMonths }),
              ]
                .filter(Boolean)
                .join(' · ') || '—'}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5">
            <dt className="text-xs text-muted-foreground">{t('maintenance.lastDone')}</dt>
            <dd className="numeric">
              {oil.lastDoneOn === null
                ? t('maintenance.never')
                : `${formatDate(oil.lastDoneOn, locale)}${
                    oil.lastDoneKm === null
                      ? ''
                      : ` · ${formatKilometers(oil.lastDoneKm, locale)} km`
                  }`}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5">
            <dt className="text-xs text-muted-foreground">{t('maintenance.nextDueKm')}</dt>
            <dd className="numeric">
              {oil.nextDueKm === null
                ? '—'
                : `${formatKilometers(oil.nextDueKm, locale)} km`}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5">
            <dt className="text-xs text-muted-foreground">{t('maintenance.nextDueOn')}</dt>
            <dd className="numeric">
              {oil.nextDueOn === null ? '—' : formatDate(oil.nextDueOn, locale)}
            </dd>
          </div>
        </dl>
      )}

      {canWrite ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMode(mode === 'interval' ? null : 'interval')}
          >
            {oil === undefined ? t('maintenance.setUp') : t('maintenance.editInterval')}
          </Button>
          <Button
            type="button"
            variant="default"
            onClick={() => setMode(mode === 'record' ? null : 'record')}
          >
            {t('maintenance.record')}
          </Button>
        </div>
      ) : null}

      {mode === 'interval' ? (
        <form
          method="post"
          className="mt-4 grid gap-5 sm:grid-cols-2"
          onSubmit={(event) => void saveInterval(event)}
        >
          <Field
            name="intervalKm"
            type="number"
            min={100}
            max={200000}
            step={500}
            label={t('maintenance.intervalKm')}
            hint={t('maintenance.intervalHint')}
            defaultValue={oil?.intervalKm ?? DEFAULT_OIL_KM}
          />
          <Field
            name="intervalMonths"
            type="number"
            min={1}
            max={120}
            label={t('maintenance.intervalMonths')}
            defaultValue={oil?.intervalMonths ?? DEFAULT_OIL_MONTHS}
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('auth.working') : t('action.save')}
            </Button>
          </div>
        </form>
      ) : null}

      {mode === 'record' ? (
        <form
          method="post"
          className="mt-4 grid gap-5 sm:grid-cols-2"
          onSubmit={(event) => void saveRecord(event)}
        >
          <Field
            name="performedOn"
            type="date"
            label={t('maintenance.performedOn')}
            defaultValue={today}
            required
          />
          {/* Le compteur du jour est PROPOSÉ : c'est la valeur juste neuf fois sur dix,
              et la corriger coûte moins cher que de la retrouver. */}
          <Field
            name="km"
            type="number"
            min={0}
            label={t('maintenance.km')}
            defaultValue={currentKm}
          />
          <Field
            name="garageName"
            numeric={false}
            label={t('maintenance.garage')}
            maxLength={80}
          />
          <Field name="parts" label={t('maintenance.parts')} inputMode="decimal" />
          <Field name="labour" label={t('maintenance.labour')} inputMode="decimal" />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? t('auth.working') : t('maintenance.record')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
