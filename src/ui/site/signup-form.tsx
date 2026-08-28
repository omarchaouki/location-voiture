import { ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { isMoroccanPhone } from '~/core/phone'
import { FLEET_SIZES, type FleetSize } from '~/core/schemas/lead'
import type { Locale } from '~/i18n/locales'
import { submitLead } from '~/server/leads'
import { CityCombobox } from '~/ui/forms/city-combobox'
import { choiceField, textField } from '~/ui/forms/form-data'
import { useHydrated } from '~/ui/forms/use-hydrated'
import { Alert } from '~/ui/shadcn/alert'
import { Button } from '~/ui/shadcn/button'
import { Card, CardContent } from '~/ui/shadcn/card'
import { Field, Input, Select, Textarea } from '~/ui/shadcn/field'
import { Reveal } from './reveal'

/**
 * LE FORMULAIRE — le seul point d'écriture public du produit, et le seul endroit de
 * cette page où l'on gagne ou perd un prospect.
 *
 * Quatre décisions le dessinent, dans l'ordre où elles comptent :
 *
 * **1. DEUX champs obligatoires, un nom et un numéro.** Chaque champ obligatoire de
 * plus coûte des prospects, et un premier contact n'a pas besoin de connaître la
 * taille de la flotte. Tout le reste est facultatif ET REPLIÉ (`progressive-disclosure`) :
 * un formulaire de sept champs se lit comme un dossier à monter, celui-ci se lit comme
 * un rappel à demander.
 *
 * **2. Le repli est un `<details>` NATIF.** Les champs restent dans le document, donc
 * dans `new FormData(form)` : quelqu'un qui déplie, remplit, replie, puis valide
 * n'envoie pas un formulaire amputé. C'est le même principe que les étapes de
 * `src/ui/forms/steps.tsx`, et il évite d'écrire un état d'ouverture, un pilotage
 * clavier et une annonce de repli qui existent déjà dans le navigateur.
 *
 * **3. La validation se fait à la SORTIE du champ, jamais à la frappe.** Signaler
 * « numéro invalide » au troisième chiffre d'un numéro qu'on est en train de taper est
 * la façon la plus sûre de faire abandonner (`inline-validation`). Après un envoi
 * refusé, le premier champ fautif reçoit le focus (`focus-management`).
 *
 * **4. Le leurre reste.** `website`, masqué aux humains ET aux lecteurs d'écran. C'est
 * la protection anti-robot la moins chère, et la seule qui n'impose rien — un CAPTCHA
 * ferait fuir exactement le gérant de 55 ans à qui ce produit s'adresse.
 *
 * `method="post"` alors que React intercepte : c'est le comportement du jour où le
 * JavaScript ne s'exécute pas. En GET, le navigateur mettrait le nom et le numéro dans
 * l'URL, donc dans l'historique et dans les journaux (docs/DECISIONS.md §13.7).
 */

type FieldName = 'name' | 'phone'
type Errors = Partial<Record<FieldName, string>>

export function SignupForm({
  locale,
  fleetSize,
  onFleetSize,
}: {
  locale: Locale
  fleetSize: FleetSize
  onFleetSize: (size: FleetSize) => void
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [errors, setErrors] = useState<Errors>({})
  const hydrated = useHydrated()

  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)

  /**
   * La règle de chaque champ, en un seul endroit.
   *
   * Elle sert à la sortie du champ ET à la soumission : deux copies auraient fini par
   * dire deux choses différentes, et c'est toujours celle de la soumission qui gagne —
   * donc l'utilisateur découvre au dernier moment une contrainte qu'on ne lui avait
   * pas signalée.
   */
  function errorOf(field: FieldName, value: string): string | undefined {
    if (field === 'name') {
      return value.trim().length >= 2 ? undefined : t('site.error.name')
    }
    return isMoroccanPhone(value) ? undefined : t('site.error.phone')
  }

  /**
   * `exactOptionalPropertyTypes` est actif : une clé PRÉSENTE valant `undefined` n'est
   * pas la même chose qu'une clé absente. On RETIRE donc l'entrée quand le champ
   * redevient valide, au lieu d'y écrire `undefined` — sinon `'name' in errors` reste
   * vrai après correction, et le compilateur refuse de passer la valeur à `<Field>`.
   */
  function validateOnBlur(field: FieldName, value: string) {
    const message = errorOf(field, value)
    setErrors((previous) => {
      const next = { ...previous }
      if (message === undefined) delete next[field]
      else next[field] = message
      return next
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = event.currentTarget
    const form = new FormData(target)

    const name = textField(form, 'name')
    const phone = textField(form, 'phone')
    const nameError = errorOf('name', name)
    const phoneError = errorOf('phone', phone)

    if (nameError !== undefined || phoneError !== undefined) {
      // Clés ABSENTES plutôt que valant `undefined` — voir `validateOnBlur`.
      setErrors({
        ...(nameError === undefined ? {} : { name: nameError }),
        ...(phoneError === undefined ? {} : { phone: phoneError }),
      })
      // Le premier champ fautif reçoit le focus : sans cela, l'erreur est annoncée
      // mais le curseur reste où il était, et il faut la chercher.
      const first = nameError !== undefined ? nameRef : phoneRef
      first.current?.focus()
      return
    }

    setErrors({})
    setState('sending')

    try {
      await submitLead({
        data: {
          name,
          phone,
          company: textField(form, 'company'),
          email: textField(form, 'email'),
          city: textField(form, 'city'),
          fleetSize: choiceField(form, 'fleetSize', FLEET_SIZES, '1-5'),
          message: textField(form, 'message'),
          locale,
          website: textField(form, 'website'),
        },
      })
      target.reset()
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <Reveal as="section" id="demo" className="py-14 sm:py-20">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="lg:self-center">
          <h2 className="text-xl font-semibold tracking-tight">{t('site.demoTitle')}</h2>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">{t('site.demoBody')}</p>

          {/*
            CE QUI SE PASSE APRÈS L'ENVOI, dit AVANT.
            « On vous rappelle » est vague ; trois étapes datées lèvent la seule
            question qui retient encore quelqu'un au-dessus du bouton — à quoi je
            m'engage en laissant mon numéro.
          */}
          <ol className="mt-6 grid max-w-xl gap-3">
            {(['call', 'demo', 'space'] as const).map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="numeric mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-2xs font-semibold text-primary"
                >
                  {index + 1}
                </span>
                <span className="text-sm text-muted-foreground">{t(`site.next.${step}`)}</span>
              </li>
            ))}
          </ol>

          <p className="mt-6 flex max-w-xl items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t('site.demoPrivacy')}</span>
          </p>
        </div>

        <Card>
          <CardContent>
            {state === 'done' ? (
              <SentState onAgain={() => setState('idle')} />
            ) : (
              <form method="post" onSubmit={(event) => void submit(event)} className="grid gap-4" noValidate>
                <Field
                  label={t('site.fieldName')}
                  htmlFor="lead-name"
                  required
                  {...(errors.name === undefined ? {} : { error: errors.name })}
                >
                  <Input
                    id="lead-name"
                    name="name"
                    ref={nameRef}
                    required
                    autoComplete="name"
                    aria-invalid={errors.name ? true : undefined}
                    onBlur={(event) => validateOnBlur('name', event.target.value)}
                  />
                </Field>

                <Field
                  label={t('site.fieldPhone')}
                  htmlFor="lead-phone"
                  required
                  hint={t('site.fieldPhoneHint')}
                  {...(errors.phone === undefined ? {} : { error: errors.phone })}
                >
                  {/* `type="tel"` ET `inputMode="tel"` : le premier pour la sémantique
                      et le remplissage automatique, le second pour que le clavier du
                      téléphone s'ouvre sur les chiffres (`input-type-keyboard`). */}
                  <Input
                    id="lead-phone"
                    name="phone"
                    ref={phoneRef}
                    type="tel"
                    inputMode="tel"
                    required
                    autoComplete="tel"
                    aria-invalid={errors.phone ? true : undefined}
                    onBlur={(event) => validateOnBlur('phone', event.target.value)}
                  />
                </Field>

                {/*
                  TOUT LE RESTE EST FACULTATIF, et replié.
                  `<details>` natif : les champs restent dans le document, donc dans
                  `FormData`. Replier après avoir rempli ne perd rien.
                */}
                <details className="group grid gap-4">
                  <summary
                    className="flex cursor-pointer items-center gap-2 text-sm font-medium text-primary"
                    style={{ minHeight: 'var(--tap-target)' }}
                  >
                    {t('site.moreDetails')}
                  </summary>

                  <div className="grid gap-4 pt-1">
                    <Field label={t('site.fieldCompany')} htmlFor="lead-company">
                      <Input id="lead-company" name="company" autoComplete="organization" />
                    </Field>

                    <CityCombobox name="city" label={t('site.fieldCity')} />

                    {/* PILOTÉ, et non `defaultValue` : c'est ce qui permet au
                        questionnaire d'y déposer sa réponse. Un `defaultValue` ne se
                        relit qu'au montage — il aurait ignoré le report en silence. */}
                    <Field label={t('site.fieldFleetSize')} htmlFor="lead-fleet">
                      <Select
                        id="lead-fleet"
                        name="fleetSize"
                        value={fleetSize}
                        onChange={(event) => onFleetSize(event.target.value as FleetSize)}
                      >
                        {FLEET_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label={t('site.fieldEmail')} htmlFor="lead-email">
                      <Input
                        id="lead-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                      />
                    </Field>

                    <Field label={t('site.fieldMessage')} htmlFor="lead-message">
                      <Textarea id="lead-message" name="message" rows={3} />
                    </Field>
                  </div>
                </details>

                {/* Leurre. Invisible aux humains ET aux lecteurs d'écran. */}
                <div aria-hidden="true" className="hidden">
                  <label>
                    Website
                    <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                  </label>
                </div>

                {/* Le bouton attend l'hydratation : avant elle, valider enverrait un
                    POST natif qui recharge la page sans rien enregistrer.
                    Voir src/ui/forms/use-hydrated.ts. */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!hydrated || state === 'sending'}
                >
                  <span>{state === 'sending' ? t('auth.working') : t('site.send')}</span>
                  {state === 'sending' ? null : (
                    <ArrowRight className="icon-directional" aria-hidden="true" />
                  )}
                </Button>

                <p className="text-center text-2xs text-muted-foreground">{t('site.noCommitment')}</p>

                {state === 'error' ? (
                  <Alert role="alert" variant="destructive">
                    {t('site.sendFailed')}
                  </Alert>
                ) : null}
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </Reveal>
  )
}

/**
 * L'accusé de réception.
 *
 * Il REMPLACE le formulaire au lieu de s'ajouter sous lui. Un formulaire encore rempli
 * sous un message « c'est envoyé » invite à renvoyer, et la déduplication côté serveur
 * — un même numéro par jour — ferait alors disparaître le second envoi en silence :
 * l'utilisateur croirait avoir corrigé quelque chose.
 *
 * `role="status"` et non `alert` : une confirmation attendue s'annonce, elle
 * n'interrompt pas.
 */
function SentState({ onAgain }: { onAgain: () => void }) {
  const { t } = useTranslation()

  return (
    <div role="status" className="grid justify-items-center gap-4 py-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-6" aria-hidden="true" />
      </span>

      <div className="grid gap-1.5">
        <p className="text-base font-semibold">{t('site.sent')}</p>
        <p className="text-sm text-muted-foreground">{t('site.sentBody')}</p>
      </div>

      <Button type="button" variant="ghost" onClick={onAgain}>
        {t('site.sendAnother')}
      </Button>
    </div>
  )
}
