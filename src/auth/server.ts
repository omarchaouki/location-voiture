import { and, eq, gt } from 'drizzle-orm'
import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { organization } from 'better-auth/plugins/organization'
import { tanstackStartCookies } from 'better-auth/tanstack-start'

import { getDb, type Db } from '~/db/client'
import * as schema from '~/db/schema'
import { invitations } from '~/db/schema/auth'
import { DEFAULT_LOCALE, isLocale } from '~/i18n/locales'
import { getNotifier } from '~/server/notifier'
import { ac, PLATFORM_OWNER, platformAc, platformRoles, roles } from './permissions'

/**
 * Configuration de l'authentification.
 *
 * Toutes les options ci-dessous ont été relevées dans les types du paquet installé
 * (`better-auth@1.7.1`), pas dans une page de documentation. Le schéma des sept
 * tables vient de `getSchema()` du même paquet — voir `src/db/schema/auth.ts`.
 *
 * Le reste du code ne parle JAMAIS à ce module directement : il passe par
 * `src/auth/context.ts` (`requireTenant`, `requireRole`, `requirePlatformOwner`).
 * C'est ce qui rendra la bascule vers Supabase Auth indolore pour les écrans.
 */

/**
 * Fenêtre d'amorçage — variable de PROCESSUS, jamais un en-tête ni un paramètre.
 *
 * Le tout premier compte de plateforme doit bien naître quelque part. Elle n'est
 * ouverte que par `pnpm admin:create` (et par les tests), le temps d'une création,
 * et il n'existe aucun moyen de l'ouvrir depuis le réseau.
 */
let bootstrapWindowOpen = false

export function openBootstrapWindow(): void {
  bootstrapWindowOpen = true
}

export function closeBootstrapWindow(): void {
  bootstrapWindowOpen = false
}

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60
const THIRTY_MINUTES_IN_SECONDS = 30 * 60

/** Les champs métier posés sur l'organisation. Voir docs/DECISIONS.md É2. */
const organizationAdditionalFields = {
  planCode: { type: 'string', input: true, required: false },
  status: { type: 'string', input: true, required: false },
  isDemo: { type: 'boolean', input: false, required: false },
  trialEndsAt: { type: 'date', input: true, required: false },
  city: { type: 'string', input: true, required: false },
  contactPhone: { type: 'string', input: true, required: false },
  contactEmail: { type: 'string', input: true, required: false },
  localeDefault: { type: 'string', input: true, required: false },
  timezone: { type: 'string', input: true, required: false },
  internalNote: { type: 'string', input: true, required: false },
  deletedAt: { type: 'date', input: false, required: false },
} as const

/**
 * Fabrique — une instance par base. Les tests créent la leur sur une base en
 * mémoire ; l'application utilise le singleton `auth` en bas de fichier.
 */
/**
 * Jointures de l'adaptateur Drizzle pour `/get-session`.
 *
 * Réglage arrêté en Phase 8, APRÈS mesure — voir docs/DECISIONS.md §13.1 et
 * `tests/unit/auth-joins.test.ts`, qui compte les requêtes des deux côtés et échoue
 * si le gain disparaît. Le changer sans remesurer n'a aucun sens.
 */
const DATABASE_JOINS = true

export interface AuthOptions {
  /**
   * Jointures de l'adaptateur Drizzle. Paramétrable UNIQUEMENT pour pouvoir mesurer
   * les deux réglages côte à côte (`tests/unit/auth-joins.test.ts`) : le produit,
   * lui, n'en a qu'un seul, fixé ci-dessous.
   */
  joins?: boolean
}

export function createAuth(db: Db, options: AuthOptions = {}) {
  return betterAuth({
    appName: 'Flotta',
    baseURL: process.env['APP_URL'] ?? 'http://localhost:5173',
    secret: process.env['AUTH_SECRET'] ?? 'dev-only-secret-change-me',

    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
      // `user` → `users`, `organization` → `organizations`, etc.
      usePlural: true,
    }),

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
    },

    user: {
      /**
       * CHANGEMENT D'ADRESSE — validé depuis l'ANCIENNE.
       *
       * L'adresse est l'identifiant de connexion : la laisser changer sans preuve
       * ferait d'un poste laissé déverrouillé une prise de compte définitive, puisque
       * la victime ne pourrait même plus demander un mot de passe oublié.
       *
       * Better Auth envoie donc un lien de confirmation à l'adresse ACTUELLE, et
       * n'écrit la nouvelle qu'une fois ce lien suivi. C'est le bon sens : celui qui
       * contrôle l'ancienne boîte est le propriétaire du compte, celui qui est assis
       * devant l'écran ne l'est pas forcément.
       *
       * Le message part par le `Notifier` du produit — console en développement,
       * Resend en production. Aucune partie du code ne connaît le prestataire.
       */
      changeEmail: {
        enabled: true,
        sendChangeEmailVerification: async ({
          user,
          newEmail,
          url,
        }: {
          user: { email: string }
          newEmail: string
          url: string
        }) => {
          await getNotifier().send({
            to: user.email,
            locale: DEFAULT_LOCALE,
            subject: 'Confirmez le changement d’adresse',
            body: [
              `Une demande de changement d'adresse a été faite sur votre compte Flotta.`,
              '',
              `Nouvelle adresse demandée : ${newEmail}`,
              '',
              'Si vous êtes à l’origine de cette demande, confirmez-la ici :',
              url,
              '',
              "Si ce n'est pas vous, ignorez ce message : rien ne changera.",
            ].join('\n'),
          })
        },
      },
    },

    hooks: {
      /**
       * PAS D'INSCRIPTION PUBLIQUE (cahier des charges §1).
       *
       * Le contrôle est ici, sur l'endpoint, et pas seulement dans l'absence d'une
       * page « créer un compte » : quelqu'un qui appelle `/api/auth/sign-up/email`
       * directement doit être refusé aussi. On n'accepte une création de compte que
       * si une invitation en cours existe pour cette adresse.
       *
       * `SELF_SERVE_SIGNUP=true` ouvre l'inscription libre le jour venu — l'autre
       * chemin du cahier des charges, présent dès maintenant, pas à réécrire.
       */
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') return
        if (process.env['SELF_SERVE_SIGNUP'] === 'true') return
        if (bootstrapWindowOpen) return

        const raw = (ctx.body as { email?: unknown } | undefined)?.email
        const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
        const pending = email
          ? await db
              .select({ id: invitations.id })
              .from(invitations)
              .where(
                and(
                  eq(invitations.email, email),
                  eq(invitations.status, 'pending'),
                  gt(invitations.expiresAt, new Date()),
                ),
              )
              .limit(1)
          : []

        if (pending.length === 0) {
          throw new APIError('FORBIDDEN', {
            message: 'Sign up is by invitation only',
            code: 'INVITATION_REQUIRED',
          })
        }
      }),
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },

    advanced: {
      /**
       * Jointures de l'adaptateur : voir `DATABASE_JOINS` et docs/DECISIONS.md §13.1.
       */
      database: { joins: options.joins ?? DATABASE_JOINS },
    },

    plugins: [
      organization({
        ac,
        roles,
        /** Le rôle donné au créateur. Dans notre flux, le propriétaire invité. */
        creatorRole: 'owner',
        /**
         * Aucun CLIENT ne crée d'organisation : c'est un acte de plateforme.
         * Seul le super administrateur en crée, depuis /admin.
         */
        allowUserToCreateOrganization: (user) =>
          (user as { role?: unknown }).role === PLATFORM_OWNER,
        /** Jeton d'invitation valable 7 jours (cahier des charges §5). */
        invitationExpiresIn: SEVEN_DAYS_IN_SECONDS,
        /** Réinviter la même adresse annule l'invitation précédente. */
        cancelPendingInvitationsOnReInvite: true,

        schema: {
          organization: { additionalFields: organizationAdditionalFields },
        },

        async sendInvitationEmail(data) {
          // Les `additionalFields` ne sont pas inférés dans le type de ce rappel :
          // on lit la langue de façon défensive plutôt que de forcer le type.
          const declared = (data.organization as { localeDefault?: unknown }).localeDefault
          const locale = isLocale(declared) ? declared : DEFAULT_LOCALE
          const base = process.env['APP_URL'] ?? 'http://localhost:5173'
          const link = `${base}/${locale}/invitation/${data.id}`

          /*
           * L'envoi passe par le verrou de démonstration, jamais par le notificateur
           * directement (docs/DOMAIN.md, invariant 11).
           *
           * Avant cette phase, un visiteur de l'espace de démonstration qui invitait
           * un collègue envoyait un VRAI courriel à une VRAIE adresse. Le drapeau
           * `is_demo` existait, s'affichait dans un cachet à l'écran, et n'empêchait
           * rien du tout.
           */
          /*
           * `db` — celui de CETTE instance d'authentification — et non une connexion
           * par défaut. La variante `…WithDefaultDb` appelait `getDb()`, donc une
           * AUTRE base que celle qui venait d'écrire l'invitation. SQLite ne s'en
           * plaignait pas : il ouvrait simplement un second fichier, l'organisation
           * n'y existait pas, et l'envoi était abandonné en silence. Postgres, lui,
           * refuse net faute de `DATABASE_URL` — et c'est ce refus qui a montré le
           * défaut, resté invisible pendant toute la vie du projet.
           */
          const { notifyForOrganization } = await import('~/server/demo/locks')
          await notifyForOrganization(db, data.organization.id, {
            to: data.email,
            locale,
            subject: `Invitation — ${data.organization.name}`,
            body: [
              `Vous êtes invité à rejoindre ${data.organization.name} sur Flotta.`,
              `Rôle : ${data.role}`,
              '',
              `Lien (valable 7 jours, à usage unique) :`,
              link,
            ].join('\n'),
          })
        },
      }),

      admin({
        /**
         * Le plugin exige que tout rôle cité dans `adminRoles` existe dans `roles` —
         * vérifié à l'exécution, pas au typage : la première tentative a échoué avec
         * « Invalid admin roles: platform_owner ».
         */
        ac: platformAc,
        roles: platformRoles,
        /** Rôle plateforme, distinct des rôles internes aux organisations. */
        adminRoles: [PLATFORM_OWNER],
        defaultRole: 'user',
        /**
         * 30 minutes, contre 1 heure par défaut. L'impersonation est la fonctionnalité
         * la plus dangereuse du produit ; elle expire vite et elle est tracée.
         */
        impersonationSessionDuration: THIRTY_MINUTES_IN_SECONDS,
      }),

      // Pose les cookies de session via TanStack Start.
      tanstackStartCookies(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

let instance: Auth | undefined

/** Instance partagée du processus. */
export function getAuth(): Auth {
  instance ??= createAuth(getDb())
  return instance
}
