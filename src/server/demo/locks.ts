import { eq } from 'drizzle-orm'

import { getDb, type Db } from '~/db/client'
import { forOrg } from '~/db/repositories/base'
import { notifications } from '~/db/schema/alerts'
import { organizations } from '~/db/schema/auth'
import { systemContext } from '../system-context'
import { getNotifier, type NotificationMessage } from '../notifier'

/**
 * VERROUS DURS DU MODE DÉMONSTRATION — invariant 11 de docs/DOMAIN.md.
 *
 * « Une organisation `is_demo` ne peut émettre aucune notification réelle, aucun appel
 * de paiement, aucun export de masse. »
 *
 * Le mot important est **dur**. Le drapeau existait depuis la Phase 1, il s'affichait
 * dans un cachet à l'écran, et il n'empêchait rien : un visiteur de la démonstration
 * qui invitait un collègue envoyait un vrai courriel à une vraie adresse. Ce fichier
 * est ce qui rend l'invariant vrai.
 *
 * Le verrou n'est pas un silence : la notification est **enregistrée** avec l'état
 * `skipped_demo`. La démonstration doit montrer le comportement du produit — « un
 * courriel serait parti ici » — sans en envoyer un seul.
 */

export class DemoLockedError extends Error {
  constructor(readonly action: string) {
    super(`action refused in demo mode: ${action}`)
    this.name = 'DemoLockedError'
  }
}

/** L'organisation est-elle un espace de démonstration ? Lu en base, jamais deviné. */
export async function isDemoOrganization(db: Db, orgId: string): Promise<boolean> {
  const rows = await db
    .select({ isDemo: organizations.isDemo })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1)

  return rows[0]?.isDemo === true
}

/**
 * Refuse un acte irréversible ou sortant dans un espace de démonstration.
 *
 * À appeler AVANT l'acte. Les appels visés : envoi réel, appel de paiement, export de
 * masse. Aujourd'hui seul l'envoi existe dans le produit — les deux autres sont
 * préparés ici pour que la garde soit en place le jour où ils arrivent, et non
 * rajoutée après coup.
 */
export async function assertNotDemo(db: Db, orgId: string, action: string): Promise<void> {
  if (await isDemoOrganization(db, orgId)) throw new DemoLockedError(action)
}

/**
 * Envoie une notification au nom d'une organisation — ou fait semblant, si c'est une démo.
 *
 * C'est le SEUL chemin d'envoi du produit. Appeler `getNotifier().send()` directement
 * contourne le verrou : c'est précisément ce que faisait l'invitation avant cette phase.
 */
export async function notifyForOrganization(
  db: Db,
  orgId: string,
  message: NotificationMessage,
  channel = 'email',
): Promise<{ state: 'sent' | 'skipped_demo' | 'failed' }> {
  const demo = await isDemoOrganization(db, orgId)
  const record = forOrg<typeof notifications.$inferSelect>(
    db,
    systemContext(orgId, 'demo'),
    notifications,
  )

  if (demo) {
    await record.insert({
      channel,
      recipient: message.to,
      subject: message.subject,
      body: message.body,
      locale: message.locale,
      state: 'skipped_demo',
    })
    return { state: 'skipped_demo' }
  }

  try {
    await getNotifier().send(message)
    await record.insert({
      channel,
      recipient: message.to,
      subject: message.subject,
      body: message.body,
      locale: message.locale,
      state: 'sent',
      sentAt: new Date().toISOString(),
    })
    return { state: 'sent' }
  } catch (error) {
    // Un échec d'envoi se TRACE : sinon on ne saura jamais qu'une invitation n'est
    // jamais arrivée, et le client sera accusé de ne pas avoir cliqué.
    await record.insert({
      channel,
      recipient: message.to,
      subject: message.subject,
      body: message.body,
      locale: message.locale,
      state: 'failed',
      error: String(error),
    })
    return { state: 'failed' }
  }
}

/** Variante pour les appelants qui n'ont pas la connexion sous la main. */
export async function notifyForOrganizationWithDefaultDb(
  orgId: string,
  message: NotificationMessage,
  channel = 'email',
): Promise<{ state: 'sent' | 'skipped_demo' | 'failed' }> {
  return notifyForOrganization(getDb(), orgId, message, channel)
}
