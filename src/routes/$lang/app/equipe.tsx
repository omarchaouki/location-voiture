import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ORG_ROLES } from '~/auth/permissions'
import { MIN_PASSWORD_LENGTH } from '~/core/schemas/signup'
import { formatNumber } from '~/i18n/format'
import { DEFAULT_LOCALE, isLocale, type Locale } from '~/i18n/locales'
import { createMember, loadTeam, removeMember, setMemberRole } from '~/server/members'
import { EmptyState } from '~/ui/feedback/states'
import { Field, Select } from '~/ui/forms/fields'
import { choiceField, textField } from '~/ui/forms/form-data'
import { Alert } from '~/ui/shadcn/alert'
import { Badge } from '~/ui/shadcn/badge'
import { Button, buttonVariants } from '~/ui/shadcn/button'
import { Select as SelectControl } from '~/ui/shadcn/field'
import { cn } from '~/ui/shadcn/utils'

/**
 * L'ÉQUIPE — qui a une clé de l'agence, et quelle clé.
 *
 * Le produit ne savait faire entrer quelqu'un que par une invitation envoyée à une
 * adresse électronique. C'est le bon chemin pour un collègue qui relève sa boîte ; ce
 * n'est pas celui d'une agence marocaine ordinaire, où trois agents de comptoir se
 * partagent l'adresse du gérant. Un lien d'activation envoyé à une boîte que personne
 * n'ouvre est un accès que personne n'obtient.
 *
 * Ici, le gérant crée le compte ET son mot de passe, et le donne de vive voix. La
 * personne le changera depuis son écran de compte.
 *
 * **Le quota est montré AVANT le formulaire, pas après le refus.** Un formulaire qu'on
 * remplit pour s'entendre dire « offre insuffisante » au moment de valider est un
 * formulaire qui fâche. La jauge dit d'emblée combien de comptes restent, et le
 * formulaire disparaît quand il n'en reste aucun — remplacé par le seul geste utile à
 * ce moment-là : aller voir l'offre.
 */
export const Route = createFileRoute('/$lang/app/equipe')({
  loader: async () => ({ team: await loadTeam() }),
  component: TeamPage,
})

function TeamPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const { team } = Route.useLoaderData()
  const { lang } = Route.useParams()
  const locale: Locale = isLocale(lang) ? lang : DEFAULT_LOCALE

  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [created, setCreated] = useState(false)

  const used = team.members.length
  const full = team.maxUsers !== null && used >= team.maxUsers

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)

    setBusy(true)
    setRefusal(null)
    setCreated(false)
    try {
      const result = await createMember({
        data: {
          name: textField(data, 'name'),
          email: textField(data, 'email'),
          password: textField(data, 'password'),
          role: choiceField(data, 'role', ORG_ROLES, 'agent'),
        },
      })

      if (!result.ok) {
        setRefusal(result.reason)
        return
      }
      setCreated(true)
      // Le formulaire se vide : le mot de passe qui vient d'être communiqué n'a aucune
      // raison de rester affiché sur un écran de comptoir.
      form.reset()
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  async function changeRole(memberId: string, role: string) {
    setBusy(true)
    setRefusal(null)
    try {
      const result = await setMemberRole({
        data: { memberId, role: role as (typeof ORG_ROLES)[number] },
      })
      if (!result.ok) setRefusal(result.reason)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  async function drop(memberId: string) {
    setBusy(true)
    setRefusal(null)
    try {
      const result = await removeMember({ data: { memberId } })
      if (!result.ok) setRefusal(result.reason)
      await router.invalidate()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-input pb-3">
        <h1 className="text-2xl">{t('team.title')}</h1>
        <span className="text-xs text-muted-foreground">{t('team.subtitle')}</span>
        <span className="numeric ms-auto text-sm">
          {team.maxUsers === null
            ? t('team.usageUnlimited', { used: formatNumber(used, locale) })
            : t('team.usage', {
                used: formatNumber(used, locale),
                max: formatNumber(team.maxUsers, locale),
              })}
        </span>
      </header>

      {refusal === null ? null : (
        <Alert role="alert" variant="destructive" className="mt-4">
          {t(`team.error.${refusal}`)}
        </Alert>
      )}

      {team.members.length === 0 ? (
        <EmptyState title={t('team.empty')} body={t('team.emptyBody')} />
      ) : (
        <ul className="mt-4">
          {team.members.map((member) => (
            <li
              key={member.memberId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3"
              style={{ minHeight: 'var(--row-height-comfy)' }}
            >
              <span className="min-w-40 font-medium">
                {member.name}
                {member.isSelf ? (
                  <Badge variant="neutral" className="ms-2">
                    {t('team.you')}
                  </Badge>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">{member.email}</span>

              <span className="ms-auto flex flex-wrap items-center gap-3">
                {team.canManage && !member.isSelf ? (
                  /*
                    Le rôle se change SUR PLACE, sans écran d'édition.

                    C'est le seul champ modifiable d'une ligne, et le changement est
                    immédiat : ouvrir une fiche pour bouger une liste déroulante à un
                    seul choix serait trois clics pour un.
                  */
                  <SelectControl
                    aria-label={t('team.roleOf', { name: member.name })}
                    value={member.role}
                    disabled={busy}
                    onChange={(event) => void changeRole(member.memberId, event.target.value)}
                  >
                    {ORG_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`role.${role}`)}
                      </option>
                    ))}
                  </SelectControl>
                ) : (
                  <Badge variant="neutral">{t(`role.${member.role}`)}</Badge>
                )}

                {team.canManage && !member.isSelf ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void drop(member.memberId)}
                  >
                    {t('team.remove')}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {team.canManage ? (
        <section className="mt-10">
          <h2 className="border-b border-border pb-2 text-base">{t('team.addTitle')}</h2>

          {full ? (
            <div className="mt-4 grid gap-3">
              <Alert>{t('team.quotaReached', { plan: t(`plan.${team.planCode}`) })}</Alert>
              <Link
                to="/$lang/app/abonnement"
                params={{ lang: locale }}
                className={cn(buttonVariants({ variant: 'default' }), 'justify-self-start')}
              >
                <span>{t('team.seePlans')}</span>
              </Link>
            </div>
          ) : (
            <form
              method="post"
              className="mt-4 grid gap-5 sm:grid-cols-2"
              onSubmit={(event) => void submit(event)}
            >
              <Field
                name="name"
                numeric={false}
                label={t('auth.yourName')}
                autoComplete="off"
                required
                maxLength={120}
              />
              <Field
                name="email"
                numeric={false}
                type="email"
                label={t('auth.email')}
                autoComplete="off"
                required
                maxLength={180}
              />
              {/*
                `autoComplete="new-password"` : sans lui, le gestionnaire de mots de
                passe du navigateur propose au gérant SON propre mot de passe, qu'un
                clic distrait donnerait alors à son agent de comptoir.
              */}
              <Field
                name="password"
                numeric={false}
                type="password"
                label={t('team.password')}
                hint={t('team.passwordHint')}
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={200}
              />
              <Select
                name="role"
                label={t('team.role')}
                options={ORG_ROLES}
                prefix="role"
                defaultValue="agent"
                hint={t('team.roleHint')}
              />

              <div className="flex items-center gap-4 sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? t('auth.working') : t('team.add')}
                </Button>
                {created ? (
                  <span role="status" className="text-xs text-success">
                    {t('team.created')}
                  </span>
                ) : null}
              </div>
            </form>
          )}
        </section>
      ) : null}
    </div>
  )
}
