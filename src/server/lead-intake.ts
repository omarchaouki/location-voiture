import { createHash } from 'node:crypto'

import { z } from 'zod'

import { LeadInput } from '~/core/schemas/lead'
import type { Db } from '~/db/client'
import { leadRepository } from '~/db/repositories/leads'
import { leadAckMessage } from './emails/lead-ack'
import { getNotifier } from './notifier'

/**
 * ENREGISTREMENT d'une demande de démonstration — hors du module de server functions.
 *
 * Même raison que `src/server/reads/` (docs/DECISIONS.md §13.7), et ici elle est
 * critique : ce module importe `node:crypto` ET le repository, donc `better-sqlite3`.
 * Exporté depuis `src/server/leads.ts`, qui est importé par la page vitrine, tout
 * cela partirait dans le paquet CLIENT — seuls les corps de gestionnaires sont
 * retirés, pas les fonctions exportées à côté d'eux. C'est exactement la panne du
 * 25 août 2026, qui avait fait fuir un mot de passe dans une URL.
 *
 * Le contrôle correspondant est dans `pnpm check:budget`, qui refuse `node:crypto`
 * dans le paquet client au même titre que `better-sqlite3`.
 */

/** Un même numéro ne crée pas deux prospects dans la même journée. */
const DEDUPLICATION_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Condensé d'adresse IP.
 *
 * Salé par `AUTH_SECRET` et tronqué à 16 caractères : assez pour rapprocher deux
 * envois du même visiteur, trop peu pour remonter à l'adresse. Sans le sel, un
 * condensé d'IPv4 se casse par force brute en quelques secondes — l'espace des
 * adresses est minuscule.
 */
export function hashIp(ip: string | null, secret: string): string | null {
  if (!ip) return null
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex').slice(0, 16)
}

export interface LeadOutcome {
  /** Toujours `true` côté public : le formulaire ne renseigne pas un robot. */
  ok: true
}

export async function recordLead(
  db: Db,
  input: z.infer<typeof LeadInput>,
  context: { ipHash: string | null; now: Date },
): Promise<LeadOutcome> {
  // Leurre rempli : un humain ne voit pas ce champ. On répond « merci » et on jette.
  if (input.website && input.website.trim().length > 0) return { ok: true }

  const repository = leadRepository(db)
  const since = new Date(context.now.getTime() - DEDUPLICATION_WINDOW_MS).toISOString()
  const existing = await repository.recentByPhone(input.phone, since)
  if (existing) return { ok: true }

  const lead = await repository.create({
    name: input.name,
    phone: input.phone,
    company: input.company ?? null,
    email: input.email && input.email.length > 0 ? input.email : null,
    city: input.city ?? null,
    fleetSize: input.fleetSize ?? null,
    message: input.message ?? null,
    source: 'site',
    locale: input.locale,
    ipHash: context.ipHash,
    /*
     * La MÊME horloge que celle qui calcule la borne de déduplication, deux lignes
     * plus haut. Sans cela, on écrit à l'heure réelle et on compare à l'heure
     * injectée : la règle « pas deux fois le même numéro dans la journée » devenait
     * alors vraie ou fausse selon l'heure qu'il était au moment de l'exécution.
     */
    createdAt: context.now.toISOString(),
  })

  /*
   * Avertissement hors du chemin de réponse.
   *
   * Un prospect enregistré est acquis ; un courriel qui échoue ne doit pas le
   * perdre. L'adresse est facultative : sans `LEADS_NOTIFY_EMAIL`, rien ne part et
   * la demande attend dans `/admin`, ce qui reste un comportement correct.
   */
  const recipient = process.env['LEADS_NOTIFY_EMAIL']
  if (recipient) {
    void getNotifier()
      .send({
        to: recipient,
        locale: 'fr',
        subject: `Demande de démonstration — ${lead.name}`,
        body: [
          `Nom       : ${lead.name}`,
          `Téléphone : ${lead.phone}`,
          `Société   : ${lead.company ?? '—'}`,
          `Ville     : ${lead.city ?? '—'}`,
          `Flotte    : ${lead.fleetSize ?? '—'}`,
          `Langue    : ${lead.locale}`,
          '',
          lead.message ?? '',
        ].join('\n'),
      })
      .catch(() => {
        // Le prospect est en base ; l'échec d'envoi ne doit rien interrompre.
      })
  }

  /*
   * ACCUSÉ DE RÉCEPTION au prospect — dans SA langue.
   *
   * Il n'existe que si une adresse a été laissée, et l'adresse est facultative : la
   * moitié des gérants ne communiquent qu'au téléphone. Pas d'adresse, pas de
   * courriel, et c'est un comportement correct — le rappel reste la promesse
   * principale, l'écran de confirmation l'a déjà annoncée.
   *
   * Hors du chemin de réponse, comme l'avertissement ci-dessus, et pour la même
   * raison : un prospect enregistré est acquis, et un serveur de courriel injoignable
   * ne doit pas transformer une demande réussie en erreur à l'écran.
   */
  if (lead.email) {
    const ack = leadAckMessage(input.locale, lead.name)
    void getNotifier()
      .send({ to: lead.email, locale: input.locale, subject: ack.subject, body: ack.body })
      .catch(() => {
        // Idem : l'accusé de réception est un confort, pas la demande elle-même.
      })
  }

  return { ok: true }
}
