import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '~/i18n/locales'
import { loadSettings, updateSettings } from '~/server/settings'
import { choiceField, textField } from '~/ui/forms/form-data'
import { LanguageSwitcher } from '~/ui/i18n/language-switcher'
import { BUTTON_STYLE, Button, buttonClasses } from '~/ui/primitives/button'
import { Stamp } from '~/ui/primitives/stamp'
import { ThemeMenu } from '~/ui/theme/theme'
import { SettingsSkeleton } from '~/ui/skeletons'

/**
 * RÉGLAGES — l'identité de l'agence, et rien d'autre.
 *
 * L'écran distingue trois natures d'information, et c'est tout son propos :
 *
 *  - ce qui appartient à l'AGENCE (nom, ville, contacts) : modifiable par le
 *    propriétaire et le gérant, parce que cela figurera sur les contrats ;
 *  - ce qui appartient à l'ABONNEMENT (offre, état) : affiché ici, modifiable
 *    ailleurs — un lien plutôt qu'un formulaire, pour ne pas laisser croire qu'on
 *    change d'offre en cochant une case ;
 *  - ce qui appartient à l'APPAREIL (thème, langue) : gardé côté navigateur, et
 *    l'écran le dit, sinon on croit imposer sa langue à ses collègues.
 */
export const Route = createFileRoute('/$lang/app/reglages')({
  loader: async () => ({ settings: await loadSettings() }),
  pendingComponent: SettingsSkeleton,
  component: SettingsPage,
})

function SettingsPage() {
  const { t } = useTranslation()
  const { settings } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE
  const router = useRouter()

  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setSaved(false)

    try {
      await updateSettings({
        data: {
          name: textField(form, 'name'),
          city: emptyToNull(textField(form, 'city')),
          contactPhone: emptyToNull(textField(form, 'contactPhone')),
          contactEmail: emptyToNull(textField(form, 'contactEmail')),
          // Les helpers de formulaire du projet : ils écartent le cas `File`, qu'un
          // `String(value)` transformerait en « [object Object] » sans prévenir.
          localeDefault: choiceField(form, 'localeDefault', LOCALES, DEFAULT_LOCALE),
        },
      })
      setSaved(true)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-rule-strong pb-3">
        <h1 className="font-display text-2xl">{t('settings.title')}</h1>
        <span className="text-xs text-muted">{t('settings.subtitle')}</span>
      </header>

      <h2 className="mt-8 border-b border-rule pb-2 font-display text-md">
        {t('settings.orgSection')}
      </h2>

      {settings.canEdit ? null : (
        <p className="mt-3 text-xs text-muted">{t('settings.readOnlyHint')}</p>
      )}

      <form method="post" className="mt-4 grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <Field
          name="name"
          label={t('settings.name')}
          defaultValue={settings.name}
          disabled={!settings.canEdit}
          required
        />
        <Field
          name="city"
          label={t('settings.city')}
          defaultValue={settings.city ?? ''}
          disabled={!settings.canEdit}
        />
        <Field
          name="contactPhone"
          label={t('settings.contactPhone')}
          defaultValue={settings.contactPhone ?? ''}
          disabled={!settings.canEdit}
          type="tel"
        />
        <Field
          name="contactEmail"
          label={t('settings.contactEmail')}
          defaultValue={settings.contactEmail ?? ''}
          disabled={!settings.canEdit}
          type="email"
        />

        <label className="block">
          <span className="text-xs text-muted">{t('settings.defaultLocale')}</span>
          <select
            name="localeDefault"
            defaultValue={settings.localeDefault}
            disabled={!settings.canEdit}
            className="mt-1 block w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-base disabled:opacity-50"
            style={{ minHeight: 'var(--tap-target)' }}
          >
            {LOCALES.map((value) => (
              <option key={value} value={value}>
                {t(`language.${value}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-muted">{t('settings.timezone')}</span>
          {/* Le fuseau n'est pas modifiable : tout le métier est calculé à
              Africa/Casablanca, y compris son passage à UTC+0 pendant le Ramadan. */}
          <input
            value={settings.timezone}
            readOnly
            className="numeric mt-1 block w-full rounded-sm border border-rule bg-surface-sunken px-3 py-2 text-base text-muted"
            style={{ minHeight: 'var(--tap-target)' }}
          />
        </label>

        {settings.canEdit ? (
          <div className="flex items-center gap-4 sm:col-span-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? t('auth.working') : t('settings.save')}
            </Button>
            {saved ? (
              <span role="status" className="text-xs text-calm">
                {t('settings.saved')}
              </span>
            ) : null}
          </div>
        ) : null}
      </form>

      <h2 className="mt-10 border-b border-rule pb-2 font-display text-md">
        {t('settings.planSection')}
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="font-medium">{settings.planCode}</span>
        <Stamp tone={settings.status === 'active' ? 'calm' : 'warn'}>{settings.status}</Stamp>
        <Link
          to="/$lang/app/abonnement"
          params={{ lang: locale }}
          className={buttonClasses('secondary', 'ms-auto')}
          style={BUTTON_STYLE}
        >
          <span>{t('settings.seeBilling')}</span>
        </Link>
      </div>

      <h2 className="mt-10 border-b border-rule pb-2 font-display text-md">
        {t('settings.preferences')}
      </h2>
      <p className="mt-3 text-xs text-muted">{t('settings.preferencesHint')}</p>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <ThemeMenu />
        <LanguageSwitcher current={locale} />
      </div>
    </div>
  )
}

function Field({
  name,
  label,
  defaultValue,
  disabled,
  required,
  type = 'text',
}: {
  name: string
  label: string
  defaultValue: string
  disabled: boolean
  required?: boolean
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
        className="mt-1 block w-full rounded-sm border border-rule-strong bg-surface px-3 py-2 text-base disabled:opacity-50"
        style={{ minHeight: 'var(--tap-target)' }}
      />
    </label>
  )
}

/** Un champ vide vaut `null` en base, pas une chaîne vide : c'est « non renseigné ». */
function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value
}
