import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { defaultTemplate, type TemplateBlock } from '~/core/contract-template'
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '~/i18n/locales'
import { loadContractTemplate, saveContractTemplate } from '~/server/contract-template'
import { TemplateEditor } from '~/ui/contracts/template-editor'
import { TemplateRender } from '~/ui/contracts/template-render'
import { Field, Select } from '~/ui/forms/fields'
import { Alert } from '~/ui/shadcn/alert'
import { Button, buttonVariants } from '~/ui/shadcn/button'
import { cn } from '~/ui/shadcn/utils'

/**
 * LE MODÈLE DE CONTRAT — l'écran où l'agence écrit ses propres clauses.
 *
 * Deux colonnes sur grand écran, l'édition à gauche et l'APERÇU à droite, et c'est le
 * seul écran du produit bâti ainsi. La raison est particulière à celui-ci : ce qu'on
 * tape ici s'imprime, se signe et engage. Écrire une clause sans voir la page qu'elle
 * produit, c'est découvrir la mise en page sur le premier contrat qu'on tend à un
 * client. Sous 1024 px, l'aperçu passe SOUS l'éditeur plutôt que de se réduire — deux
 * colonnes de 180 px ne servent ni à écrire ni à relire.
 *
 * L'aperçu affiche les variables non remplies en points de conduite : c'est
 * exactement ce que verra le papier quand la donnée manquera, et il vaut mieux le
 * découvrir ici.
 */
export const Route = createFileRoute('/$lang/app/modele-contrat')({
  loader: async () => ({ template: await loadContractTemplate() }),
  component: ContractTemplatePage,
})

function ContractTemplatePage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { template } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  const [blocks, setBlocks] = useState<TemplateBlock[]>(template.blocks)
  const [contractLocale, setContractLocale] = useState(
    isLocale(template.locale) ? template.locale : DEFAULT_LOCALE,
  )
  const [name, setName] = useState(template.name || t('template.defaultName'))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const editable = template.unlocked && template.canEdit

  async function save() {
    setBusy(true)
    setSaved(false)
    try {
      await saveContractTemplate({ data: { name, locale: contractLocale, blocks } })
      setSaved(true)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('template.title')}</h1>
        <span className="text-xs text-muted-foreground">{t('template.subtitle')}</span>
        <span className="ms-auto">
          <Link
            to="/$lang/app/reglages"
            params={{ lang: locale }}
            className={buttonVariants({ variant: 'ghost' })}
          >
            <span>{t('action.back')}</span>
          </Link>
        </span>
      </header>

      {/*
        L'offre d'abord, la clause de non-conseil ensuite.

        Une agence qui n'a pas l'option voit d'emblée pourquoi l'écran est en lecture
        seule, et le seul geste utile à ce moment-là : aller voir les offres.
      */}
      {template.unlocked ? null : (
        <Alert className="mt-4">
          <span>{t('template.locked', { plan: t(`plan.${template.planCode}`) })}</span>{' '}
          <Link
            to="/$lang/app/abonnement"
            params={{ lang: locale }}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('team.seePlans')}
          </Link>
        </Alert>
      )}

      <Alert className="mt-4" variant="warn">
        {t('template.legalNotice')}
      </Alert>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              name="name"
              numeric={false}
              label={t('template.name')}
              value={name}
              disabled={!editable}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
            <Select
              name="locale"
              label={t('template.locale')}
              hint={t('template.localeHint')}
              options={LOCALES}
              prefix="language"
              value={contractLocale}
              disabled={!editable}
              onChange={(event) => {
                const next = event.target.value
                if (isLocale(next)) setContractLocale(next)
              }}
            />
          </div>

          <TemplateEditor blocks={blocks} onChange={setBlocks} disabled={!editable} />

          <div className="flex flex-wrap items-center gap-4">
            <Button type="button" disabled={!editable || busy} onClick={() => void save()}>
              {busy ? t('auth.working') : t('action.save')}
            </Button>

            {/*
              REPARTIR DU MODÈLE DU PRODUIT.

              Il remplace le contenu à l'écran, pas en base : rien n'est perdu tant
              qu'on n'a pas enregistré, et quitter la page annule le geste. C'est la
              seule action destructrice de cet écran, et elle doit rester rattrapable.
            */}
            <Button
              type="button"
              variant="outline"
              disabled={!editable || busy}
              onClick={() => setBlocks(defaultTemplate(contractLocale))}
            >
              {t('template.reset')}
            </Button>

            {saved ? (
              <span role="status" className="text-xs text-success">
                {t('settings.saved')}
              </span>
            ) : null}
          </div>
        </section>

        <section className="grid gap-3">
          <h2 className="border-b border-border pb-2 text-base">{t('template.preview')}</h2>
          <div
            /* `dir` suit la langue du CONTRAT, pas celle de l'interface : un gérant
               francophone peut préparer un contrat en arabe, et il doit le voir tel
               qu'il sortira de l'imprimante. */
            dir={contractLocale === 'ar' ? 'rtl' : 'ltr'}
            className={cn('rounded-lg border border-border bg-card p-5', 'shadow-card')}
          >
            <TemplateRender
              blocks={blocks}
              values={{}}
              signatureLabels={[t('template.signLessor'), t('template.signRenter')]}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
