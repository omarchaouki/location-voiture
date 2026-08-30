import { and, eq, isNull } from 'drizzle-orm'
import type { z } from 'zod'

import { closeSignupWindow, openSignupWindow, type Auth } from '~/auth/server'
import { addCivilDays } from '~/core/dates'
import { slugify, type SignUpInput } from '~/core/schemas/signup'
import type { Db } from '~/db/client'
import { subscriptionRepository, usageCounterRepository } from '~/db/repositories/billing'
import { members, organizations, users } from '~/db/schema/auth'
import { plans } from '~/db/schema/billing'
import { businessCivilDate } from '~/i18n/format'
import { cookieHeaderFrom } from './cookies'
import { systemContext } from './system-context'

/**
 * INSCRIPTION D'UNE AGENCE — de l'adresse électronique à l'espace ouvert, d'un geste.
 *
 * Hors du module de server functions, pour la même raison que `lead-intake.ts` : ce
 * fichier importe la base, l'authentification et deux repositories. Exporté à côté
 * d'un gestionnaire, tout cela partirait dans le paquet CLIENT — seuls les corps de
 * gestionnaires sont retirés, pas les fonctions voisines (docs/DECISIONS.md §13.7).
 *
 * **Sept écritures, et aucune ne se suffit à elle-même.** Un compte sans organisation
 * ouvre un écran vide ; une organisation sans membre n'a pas de porte ; une
 * organisation sans abonnement n'a pas de fin d'essai, donc travaille gratuitement
 * pour toujours. L'ordre ci-dessous est celui des dépendances, pas celui du formulaire.
 *
 * L'organisation est insérée EN BASE et non par `auth.api.createOrganization` : ce
 * point d'entrée est fermé à tout ce qui n'est pas un propriétaire de plateforme
 * (`allowUserToCreateOrganization`, src/auth/server.ts), et c'est une règle qu'on ne
 * lève pas pour un formulaire public. La table nous appartient — elle porte nos champs
 * métier —, l'appartenance est posée juste après, et `setActiveOrganization` la
 * vérifie.
 */

export type SignUpRefusal = 'email_taken' | 'unknown_plan' | 'refused'

export type SignUpOutcome =
  | { ok: true; organizationId: string; cookies: string[] }
  | { ok: false; reason: SignUpRefusal }

/**
 * Un identifiant d'URL libre, dérivé de la raison sociale.
 *
 * Deux agences peuvent porter le même nom — « Atlas Cars » en existe à Agadir comme à
 * Fès — et l'index d'unicité du slug ne laisse pas passer la seconde. On suffixe donc
 * jusqu'à trouver, plutôt que de refuser une inscription pour une raison que l'inscrit
 * ne pourrait ni comprendre ni corriger.
 *
 * Bornée à dix essais : au-delà ce n'est plus une collision mais une anomalie, et une
 * boucle sans fin sur le chemin d'inscription serait pire que le refus.
 */
async function freeSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name)

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${crypto.randomUUID().slice(0, 4)}`
    const taken = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1)
    if (taken.length === 0) return candidate
  }

  throw new Error('no free slug for organization')
}

export async function registerAgency(
  db: Db,
  auth: Auth,
  input: z.infer<typeof SignUpInput>,
  context: { now: Date },
): Promise<SignUpOutcome> {
  // Leurre rempli : un humain ne voit pas ce champ. On refuse sans rien créer et sans
  // rien expliquer — un robot n'a pas à apprendre ce qui l'a trahi.
  if (input.website && input.website.trim().length > 0) return { ok: false, reason: 'refused' }

  const email = input.email.trim().toLowerCase()

  /*
   * L'OFFRE EST RELUE EN BASE, et seulement si elle est PUBLIQUE.
   *
   * Le code d'offre arrive du navigateur : le croire sur parole donnerait l'offre
   * illimitée à qui sait rejouer une requête. `is_public` compte autant que
   * l'existence — `trial` existe encore en base et ne doit pas pouvoir être choisi
   * depuis la page d'inscription.
   */
  const planRows = await db
    .select({ code: plans.code, trialDays: plans.trialDays })
    .from(plans)
    .where(and(eq(plans.code, input.planCode), eq(plans.isPublic, true), isNull(plans.deletedAt)))
    .limit(1)

  const plan = planRows[0]
  if (!plan) return { ok: false, reason: 'unknown_plan' }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)
  if (existing.length > 0) return { ok: false, reason: 'email_taken' }

  /*
   * Le compte, par le chemin normal de l'authentification.
   *
   * La fenêtre porte l'ADRESSE : elle autorise cette création-ci et aucune autre, et
   * se referme dans un `finally` même si Better Auth refuse. Voir src/auth/server.ts.
   */
  openSignupWindow(email)
  let signUp: Response
  try {
    signUp = await auth.api.signUpEmail({
      body: { email, password: input.password, name: input.fullName },
      asResponse: true,
    })
  } finally {
    closeSignupWindow(email)
  }
  if (!signUp.ok) return { ok: false, reason: 'refused' }

  const created = (await signUp.clone().json()) as { user?: { id?: string } }
  const userId = created.user?.id
  if (!userId) return { ok: false, reason: 'refused' }

  const cookies = signUp.headers.getSetCookie()
  const headers = cookieHeaderFrom(cookies)

  /*
   * FIN D'ESSAI — une date CIVILE, calculée sur le calendrier marocain.
   *
   * Pas `now + 60 × 86 400 000` : le Maroc repasse à UTC+0 pendant le Ramadan, et une
   * addition en millisecondes fait alors terminer l'essai une heure trop tôt ou trop
   * tard, donc parfois la veille au soir. `addCivilDays` compte des jours de
   * calendrier, ce qui est exactement ce qu'on a promis.
   */
  const trialEndsOn = addCivilDays(businessCivilDate(context.now), plan.trialDays)
  const trialEndsAt = new Date(`${trialEndsOn}T23:59:59.999Z`)

  const organizationId = crypto.randomUUID()
  await db.insert(organizations).values({
    id: organizationId,
    name: input.agencyName,
    slug: await freeSlug(db, input.agencyName),
    createdAt: context.now,
    planCode: plan.code,
    status: 'trialing',
    trialEndsAt,
    city: input.city,
    contactPhone: input.contactPhone,
    contactEmail: email,
    localeDefault: input.locale,
  })

  await db.insert(members).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role: 'owner',
    createdAt: context.now,
  })

  /*
   * L'ABONNEMENT, et il n'est pas facultatif.
   *
   * `effectiveStatus` (src/core/billing.ts) lit la fin d'essai pour décider du passage
   * en lecture seule. Sans ligne d'abonnement, l'agence n'a pas de terme — elle
   * travaille gratuitement jusqu'à ce que quelqu'un s'en aperçoive.
   *
   * Le contexte est SYSTÈME : l'inscription n'a pas encore de session active, et le
   * repository n'accepte aucune requête sans `TenantContext`. Il porte le vrai
   * `orgId`, donc l'écriture reste cloisonnée comme n'importe quelle autre.
   */
  const tenant = systemContext(organizationId, plan.code)
  const nowIso = context.now.toISOString()

  await subscriptionRepository(db, tenant).insert({
    orgId: organizationId,
    planCode: plan.code,
    status: 'trialing',
    provider: 'manual',
    interval: 'monthly',
    periodStartAt: nowIso,
    trialEndsAt: trialEndsAt.toISOString(),
  })

  /*
   * La consommation de départ : un utilisateur, aucune voiture.
   *
   * Écrite maintenant plutôt que recalculée au premier écran, pour que la jauge de
   * quota de la page d'abonnement dise quelque chose de juste dès la première visite.
   */
  const counters = usageCounterRepository(db, tenant)
  await counters.record('users', 1, nowIso)
  await counters.record('vehicles', 0, nowIso)
  await counters.record('branches', 1, nowIso)

  // L'organisation ACTIVE de la session. Sans elle, `requireTenant` retomberait sur
  // `adoptSoleOrganization` — qui marcherait ici, mais par chance et non par dessein.
  await auth.api.setActiveOrganization({ body: { organizationId }, headers })

  return { ok: true, organizationId, cookies }
}
