import { useState } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '~/i18n/locales'
import { removeLogo, uploadLogo } from '~/server/files'
import { loadSettings, updateSettings } from '~/server/settings'
import { Button, buttonVariants } from '~/ui/shadcn/button'
import { cn } from '~/ui/shadcn/utils'
import { Field, Select } from '~/ui/forms/fields'
import { choiceField, textField } from '~/ui/forms/form-data'
import { ImageField, type ImagePickError } from '~/ui/forms/image-field'
import { BuildingIcon } from '~/ui/icons'
import { LanguageSwitcher } from '~/ui/i18n/language-switcher'
import { Badge } from '~/ui/shadcn/badge'
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

  /**
   * LE LOGO s'enregistre TOUT DE SUITE, sans passer par le bouton « Enregistrer ».
   *
   * C'est le seul champ de cet écran qui se comporte ainsi, et c'est délibéré : une
   * image choisie puis perdue parce qu'on a quitté la page sans valider est une image
   * qu'on ne rechoisit pas. Les autres champs, eux, se relisent avant d'être envoyés —
   * on corrige un numéro de téléphone, on ne corrige pas un fichier.
   */
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  async function pickLogo(dataUrl: string) {
    setLogoBusy(true)
    setLogoError(null)
    try {
      const result = await uploadLogo({ data: { dataUrl } })
      if (!result.ok) setLogoError(result.reason)
      else await router.invalidate()
    } finally {
      setLogoBusy(false)
    }
  }

  async function dropLogo() {
    setLogoBusy(true)
    setLogoError(null)
    try {
      await removeLogo()
      await router.invalidate()
    } finally {
      setLogoBusy(false)
    }
  }

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
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('settings.title')}</h1>
        <span className="text-xs text-muted-foreground">{t('settings.subtitle')}</span>
      </header>

      <h2 className="mt-8 border-b border-border pb-2 text-base">
        {t('settings.orgSection')}
      </h2>

      {settings.canEdit ? null : (
        <p className="mt-3 text-xs text-muted-foreground">{t('settings.readOnlyHint')}</p>
      )}

      {/*
        Le logo vit AU-DESSUS du formulaire, et hors de lui.

        Dedans, il donnerait à croire qu'il attend le bouton « Enregistrer » — alors
        qu'il est déjà parti. Au-dessus, il se lit comme ce qu'il est : l'en-tête de
        l'agence, celui qui s'imprimera en haut des contrats.
      */}
      <div className="mt-4">
        <ImageField
          label={t('settings.logo')}
          hint={t('settings.logoHint')}
          value={settings.logo}
          alt={t('settings.logoAlt', { name: settings.name })}
          pickLabel={t('settings.logoPick')}
          replaceLabel={t('settings.logoReplace')}
          removeLabel={t('settings.logoRemove')}
          errorLabel={(reason: ImagePickError) => t(`upload.error.${reason}`)}
          emptyIcon={<BuildingIcon className="size-8" />}
          aspect="wide"
          disabled={!settings.canEdit}
          busy={logoBusy}
          onPick={(dataUrl) => void pickLogo(dataUrl)}
          onRemove={() => void dropLogo()}
        />
        {logoError === null ? null : (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {t(`upload.error.${logoError}`)}
          </p>
        )}
      </div>

      <form method="post" className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <Field
          name="name"
          numeric={false}
          label={t('settings.name')}
          defaultValue={settings.name}
          disabled={!settings.canEdit}
          required
        />
        <Field
          name="city"
          numeric={false}
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
          numeric={false}
          label={t('settings.contactEmail')}
          defaultValue={settings.contactEmail ?? ''}
          disabled={!settings.canEdit}
          type="email"
        />

        <Select
          name="localeDefault"
          label={t('settings.defaultLocale')}
          options={LOCALES}
          prefix="language"
          defaultValue={settings.localeDefault}
          disabled={!settings.canEdit}
        />

        {/* Le fuseau n'est pas modifiable : tout le métier est calculé à
            Africa/Casablanca, y compris son passage à UTC+0 pendant le Ramadan.
            `readOnly` porte le grisé — le champ n'a plus à se le peindre lui-même. */}
        <Field label={t('settings.timezone')} value={settings.timezone} readOnly />

        {settings.canEdit ? (
          <div className="flex items-center gap-4 sm:col-span-2">
            <Button type="submit" variant="default" disabled={busy}>
              {busy ? t('auth.working') : t('settings.save')}
            </Button>
            {saved ? (
              <span role="status" className="text-xs text-success">
                {t('settings.saved')}
              </span>
            ) : null}
          </div>
        ) : null}
      </form>

      <h2 className="mt-10 border-b border-border pb-2 text-base">{t('template.title')}</h2>
      <p className="mt-3 text-xs text-muted-foreground">{t('settings.templateHint')}</p>
      <div className="mt-4">
        <Link
          to="/$lang/app/modele-contrat"
          params={{ lang: locale }}
          className={buttonVariants({ variant: 'outline' })}
        >
          <span>{t('settings.editTemplate')}</span>
        </Link>
      </div>

      <h2 className="mt-10 border-b border-border pb-2 text-base">{t('team.title')}</h2>
      <p className="mt-3 text-xs text-muted-foreground">{t('settings.teamHint')}</p>
      <div className="mt-4">
        <Link
          to="/$lang/app/equipe"
          params={{ lang: locale }}
          className={buttonVariants({ variant: 'outline' })}
        >
          <span>{t('settings.manageTeam')}</span>
        </Link>
      </div>

      <h2 className="mt-10 border-b border-border pb-2 text-base">
        {t('settings.planSection')}
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="font-medium">{settings.planCode}</span>
        <Badge variant={settings.status === 'active' ? 'calm' : 'warn'}>{settings.status}</Badge>
        <Link
          to="/$lang/app/abonnement"
          params={{ lang: locale }}
          className={cn(buttonVariants({ variant: 'outline' }), 'ms-auto')}
        >
          <span>{t('settings.seeBilling')}</span>
        </Link>
      </div>

      <h2 className="mt-10 border-b border-border pb-2 text-base">
        {t('settings.preferences')}
      </h2>
      <p className="mt-3 text-xs text-muted-foreground">{t('settings.preferencesHint')}</p>
      <div className="mt-4 flex flex-wrap items-center gap-6">
        <ThemeMenu />
        <LanguageSwitcher current={locale} />
      </div>
    </div>
  )
}

/** Un champ vide vaut `null` en base, pas une chaîne vide : c'est « non renseigné ». */
function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value
}
