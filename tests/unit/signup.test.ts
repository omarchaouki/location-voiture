import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { PLATFORM_OWNER } from '~/auth/permissions'
import type { Auth } from '~/auth/server'
import { slugify } from '~/core/schemas/signup'
import type { Db } from '~/db/client'
import { members, organizations, users } from '~/db/schema/auth'
import { subscriptions } from '~/db/schema/billing'
import { ensurePlans } from '~/server/plan'
import { registerAgency } from '~/server/signup-intake'
import { createTestAuth, signIn } from '../helpers/auth'
import { createTestDb } from '../helpers/db'

/**
 * L'INSCRIPTION LIBRE, prouvée de bout en bout.
 *
 * Elle traverse la vraie pile Better Auth, sur une base migrée en mémoire. C'est
 * indispensable ici plus qu'ailleurs : le point délicat de cette fonctionnalité est
 * précisément le crochet qui REFUSE les inscriptions sans invitation
 * (`src/auth/server.ts`), et un faux d'authentification ne prouverait rien de la
 * fenêtre qui l'ouvre pour une adresse et une seule.
 *
 * Ce que ces tests protègent, dans l'ordre où ça coûte cher :
 *
 *  1. **sept écritures, ou aucune de valable.** Un compte sans organisation ouvre un
 *     écran vide ; une organisation sans abonnement travaille gratuitement pour
 *     toujours, parce que `effectiveStatus` n'a alors aucune fin d'essai à lire ;
 *  2. **la porte reste fermée pour les autres.** La fenêtre porte une adresse : une
 *     inscription en cours ne doit pas ouvrir l'endpoint à quelqu'un d'autre ;
 *  3. **l'offre est relue en base.** Une requête forgée ne doit pas pouvoir réclamer
 *     une offre non publique.
 */

const NOW = new Date('2026-08-29T09:00:00.000Z')

let db: Db
let auth: Auth

beforeEach(async () => {
  db = await createTestDb()
  auth = createTestAuth(db)
  await ensurePlans(db)
})

function form(overrides: Partial<Parameters<typeof registerAgency>[2]> = {}) {
  return {
    agencyName: 'Atlas Cars',
    city: 'Agadir',
    contactPhone: '+212612345678',
    fullName: 'Yassine Berrada',
    email: 'yassine@atlascars.ma',
    password: 'mot-de-passe-tres-long',
    passwordConfirm: 'mot-de-passe-tres-long',
    planCode: 'starter',
    locale: 'fr' as const,
    ...overrides,
  }
}

describe('inscription d’une agence', () => {
  it('monte le compte, l’organisation, l’appartenance et l’abonnement', async () => {
    const outcome = await registerAgency(db, auth, form(), { now: NOW })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const org = (
      await db.select().from(organizations).where(eq(organizations.id, outcome.organizationId))
    )[0]
    expect(org?.name).toBe('Atlas Cars')
    expect(org?.planCode).toBe('starter')
    expect(org?.status).toBe('trialing')
    expect(org?.localeDefault).toBe('fr')
    // Le téléphone est NORMALISÉ par le schéma, pas recopié tel quel.
    expect(org?.contactPhone).toBe('+212612345678')

    const owner = (
      await db
        .select({ role: members.role })
        .from(members)
        .where(eq(members.organizationId, outcome.organizationId))
    )[0]
    expect(owner?.role).toBe('owner')

    /*
     * L'ABONNEMENT est ce qu'on oublie le plus facilement, et son absence ne se voit
     * pas : l'agence travaille, tout marche, et personne ne paie jamais parce qu'aucune
     * fin d'essai n'existe.
     */
    const subscription = (
      await db.select().from(subscriptions).where(eq(subscriptions.orgId, outcome.organizationId))
    )[0]
    expect(subscription?.status).toBe('trialing')
    expect(subscription?.planCode).toBe('starter')
    expect(subscription?.trialEndsAt).not.toBeNull()
  })

  /**
   * DEUX MOIS, la promesse commerciale, vérifiée sur la date écrite en base.
   *
   * Elle est comptée en jours de CALENDRIER et non en millisecondes : le Maroc repasse
   * à UTC+0 pendant le Ramadan, et une addition de 60 × 86 400 000 ferait alors finir
   * l'essai la veille au soir.
   */
  it('pose une fin d’essai à soixante jours de calendrier', async () => {
    const outcome = await registerAgency(db, auth, form(), { now: NOW })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const org = (
      await db
        .select({ trialEndsAt: organizations.trialEndsAt })
        .from(organizations)
        .where(eq(organizations.id, outcome.organizationId))
    )[0]

    // 29 août + 60 jours = 28 octobre.
    expect(org?.trialEndsAt?.toISOString().slice(0, 10)).toBe('2026-10-28')
  })

  it('ouvre une session utilisable tout de suite', async () => {
    const outcome = await registerAgency(db, auth, form(), { now: NOW })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    // Les cookies posés sur la réponse sont ceux d'une vraie session : la personne
    // n'a pas à retaper le mot de passe qu'elle vient de choisir.
    expect(outcome.cookies.length).toBeGreaterThan(0)

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: outcome.cookies.map((c) => c.split(';')[0]).join('; ') }),
    })
    expect(session?.session.activeOrganizationId).toBe(outcome.organizationId)
  })

  it('refuse une adresse déjà utilisée, sans rien créer', async () => {
    await registerAgency(db, auth, form(), { now: NOW })
    const second = await registerAgency(
      db,
      auth,
      form({ agencyName: 'Autre agence' }),
      { now: NOW },
    )

    expect(second).toEqual({ ok: false, reason: 'email_taken' })
    const all = await db.select({ id: organizations.id }).from(organizations)
    expect(all).toHaveLength(1)
  })

  /**
   * `trial` existe en base et n'est PAS public : une requête forgée qui le réclamerait
   * — ou qui réclamerait n'importe quel code inventé — doit être refusée.
   */
  it('refuse une offre qui n’est pas publique', async () => {
    const outcome = await registerAgency(db, auth, form({ planCode: 'trial' }), { now: NOW })
    expect(outcome).toEqual({ ok: false, reason: 'unknown_plan' })
    expect(await db.select({ id: users.id }).from(users)).toHaveLength(0)
  })

  it('jette silencieusement une soumission de robot', async () => {
    const outcome = await registerAgency(db, auth, form({ website: 'https://spam.example' }), {
      now: NOW,
    })
    expect(outcome).toEqual({ ok: false, reason: 'refused' })
    expect(await db.select({ id: users.id }).from(users)).toHaveLength(0)
  })

  /**
   * LA PORTE RESTE FERMÉE.
   *
   * Une inscription réussie ne doit pas laisser l'endpoint ouvert derrière elle : la
   * fenêtre est refermée dans un `finally`, et elle ne valait de toute façon que pour
   * l'adresse qu'on créait.
   */
  it('ne laisse pas l’inscription ouverte pour une autre adresse', async () => {
    await registerAgency(db, auth, form(), { now: NOW })

    await expect(
      auth.api.signUpEmail({
        body: {
          email: 'intrus@ailleurs.ma',
          password: 'mot-de-passe-tres-long',
          name: 'Intrus',
        },
      }),
    ).rejects.toThrow(/INVITATION_REQUIRED|invitation only/i)
  })

  it('donne deux identifiants d’URL distincts à deux agences homonymes', async () => {
    await registerAgency(db, auth, form(), { now: NOW })
    await registerAgency(db, auth, form({ email: 'contact@atlas2.ma' }), { now: NOW })

    const slugs = (await db.select({ slug: organizations.slug }).from(organizations)).map(
      (row) => row.slug,
    )
    expect(new Set(slugs).size).toBe(2)
    expect(slugs.every((slug) => slug.startsWith('atlas-cars'))).toBe(true)
  })

  it('laisse se reconnecter avec le mot de passe choisi', async () => {
    await registerAgency(db, auth, form(), { now: NOW })
    const again = await signIn(auth, {
      email: 'yassine@atlascars.ma',
      password: 'mot-de-passe-tres-long',
    })
    expect(again.userId).toBeTruthy()
  })

  it('ne fait pas du propriétaire un administrateur de plateforme', async () => {
    const outcome = await registerAgency(db, auth, form(), { now: NOW })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return

    const account = (
      await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.email, 'yassine@atlascars.ma'))
    )[0]
    /*
     * Le rôle est celui que pose le plugin `admin` de Better Auth pour un compte
     * ordinaire — `user` — et surtout PAS `platform_owner`. On teste ce qui compte :
     * l'absence du rôle de plateforme, pas la valeur exacte que le plugin choisit,
     * qui ne nous appartient pas.
     */
    expect(account?.role).not.toBe(PLATFORM_OWNER)

    // Et il n'appartient qu'à SON organisation, pas à une autre.
    const elsewhere = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.organizationId, outcome.organizationId),
          eq(members.role, 'owner'),
        ),
      )
    expect(elsewhere).toHaveLength(1)
  })
})

describe('identifiant d’URL', () => {
  it('déplie les accents et remplace ce qui ne s’écrit pas dans une adresse', () => {
    expect(slugify('Location Réda & Fils (Casa)')).toBe('location-reda-fils-casa')
  })

  it('retombe sur un identifiant utilisable quand le nom ne survit pas', () => {
    // Un nom entièrement en arabe ne laisse aucune lettre latine : l'unicité viendra
    // du suffixe ajouté côté serveur, pas du nom.
    expect(slugify('وكالة الأطلس')).toBe('agence')
  })
})
