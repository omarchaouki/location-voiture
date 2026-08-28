import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { addCivilDays } from '~/core/dates'
import { getDb, type Db } from '~/db/client'
import { alertRepository } from '~/db/repositories/alerts'
import { forOrg } from '~/db/repositories/base'
import { alerts } from '~/db/schema/alerts'
import type { TenantContext } from '~/db/tenant'
import { runAlertScan } from './alert-scan'
import { ForbiddenError } from '~/auth/guards'
import { tenantMiddleware, writableTenantMiddleware } from './middleware'
import { systemContext } from './system-context'

/**
 * Centre de notifications.
 *
 * Trois actions, et seulement trois : reporter, marquer traité, ouvrir la fiche.
 * Une alerte ne se supprime pas — elle se referme, et le moteur la rouvrira si la
 * cause revient. C'est ce qui empêche de faire disparaître un problème en cliquant.
 */

export type AlertState = 'open' | 'snoozed' | 'acknowledged' | 'resolved'

export interface AlertView {
  id: string
  entityType: string
  entityId: string
  alertType: string
  thresholdKey: string
  severity: string
  state: AlertState
  dueOn: string | null
  snoozedUntilAt: string | null
  payload: Record<string, string | number | null>
  firstSeenAt: string
}

const SEVERITY_ORDER: Record<string, number> = {
  blocking: 0,
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
}

function toView(row: typeof alerts.$inferSelect): AlertView {
  let payload: Record<string, string | number | null> = {}
  if (row.payloadJson) {
    try {
      payload = JSON.parse(row.payloadJson) as Record<string, string | number | null>
    } catch {
      // Une charge utile illisible ne doit pas faire tomber le centre de notifications.
      payload = {}
    }
  }

  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    alertType: row.alertType,
    thresholdKey: row.thresholdKey,
    severity: row.severity,
    state: row.state as AlertState,
    dueOn: row.dueOn,
    snoozedUntilAt: row.snoozedUntilAt,
    payload,
    firstSeenAt: row.firstSeenAt,
  }
}

/**
 * Alertes en cours, les plus graves d'abord.
 *
 * Une alerte reportée reste dans la liste mais passe derrière : le report n'efface
 * pas, il range.
 */
/**
 * Les alertes VIVANTES, filtrées en SQL et non en mémoire.
 *
 * La nuance n'est pas cosmétique. Une organisation de trois ans a des milliers
 * d'alertes résolues — chaque renouvellement d'assurance en laisse une. Les lire
 * toutes pour en afficher douze, c'est faire grossir la page d'accueil avec l'âge du
 * client. L'index `alerts_inbox_idx (org_id, state, severity, due_on)` existe
 * exactement pour ce filtre ; il n'était pas utilisé.
 */
function liveAlerts(db: Db, ctx: TenantContext) {
  return alertRepository(db, ctx).live()
}

export const listAlerts = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<NotificationItem[]> => {
    const repository = alertRepository(getDb(), context.tenant)
    const rows = await repository.live()
    /*
      L'état LU voyage avec la liste, et pas seulement avec la cloche : la page des
      alertes EST le centre de notifications depuis le 27/08/2026. Sans lui, elle
      afficherait douze lignes identiques là où trois seulement sont nouvelles.
    */
    const readIds = await repository.readIdsFor(context.tenant.userId)
    const now = new Date().toISOString()

    return rows
      .map((row) => ({ ...toView(row), read: readIds.has(row.id) }))
      .sort((a, b) => {
        const snoozedA = a.state === 'snoozed' && (a.snoozedUntilAt ?? '') > now ? 1 : 0
        const snoozedB = b.state === 'snoozed' && (b.snoozedUntilAt ?? '') > now ? 1 : 0
        if (snoozedA !== snoozedB) return snoozedA - snoozedB

        return bySeverityThenDue(a, b)
      })
  })

/** Le plus grave d'abord ; à gravité égale, le plus proche. */
function bySeverityThenDue(a: AlertView, b: AlertView): number {
  const severity = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  if (severity !== 0) return severity
  return (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999')
}

/** Compteur du bandeau : ce qui est vraiment urgent, pas le total. */
export const countCriticalAlerts = createServerFn({ method: 'GET' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<{ critical: number; total: number }> => {
    // Ce compteur tourne à CHAQUE chargement de page de l'application : c'est la
    // lecture la plus fréquente du produit, et donc celle qui doit être la plus étroite.
    const rows = await liveAlerts(getDb(), context.tenant)
    const now = new Date().toISOString()

    /*
     * Le bandeau compte ce qui demande une ACTION MAINTENANT.
     *
     * Une alerte marquée traitée ou reportée n'y figure plus : sinon le compteur ne
     * descend jamais, et un bandeau qui ne descend jamais cesse d'être lu. Elle reste
     * visible dans le centre de notifications, et le moteur la rouvrira au prochain
     * seuil si la cause n'a pas bougé.
     */
    const active = rows.filter(
      (row) =>
        row.state === 'open' ||
        (row.state === 'snoozed' && (row.snoozedUntilAt ?? '') <= now),
    )

    return {
      critical: active.filter(
        (row) => row.severity === 'critical' || row.severity === 'blocking',
      ).length,
      total: active.length,
    }
  })

/* ------------------------------------------------------------- la cloche */

/**
 * LA CLOCHE — ce que l'écran interroge toutes les minutes.
 *
 * Trois choses distinctes se cachent derrière une pastille rouge, et les confondre
 * produit exactement les compteurs qui ne descendent jamais :
 *
 *  - **actif** : l'alerte demande une action maintenant (ouverte, ou reportée dont le
 *    report est échu). C'est ce que compte déjà le bandeau ;
 *  - **traité** (`acknowledged`) : quelqu'un dit avoir fait le nécessaire. Acte
 *    MÉTIER, partagé par toute l'organisation ;
 *  - **lu** : cette personne-ci a vu la notification. Fait PERSONNEL, qui ne dit rien
 *    de l'échéance et n'appartient qu'à elle (`alert_reads`).
 *
 * La pastille compte les NON LUES parmi les ACTIVES. « Tout marquer comme lu » vide
 * donc la pastille sans toucher à une seule échéance — c'est la différence entre
 * ranger sa boîte de réception et déclarer huit factures payées.
 */
export interface NotificationItem extends AlertView {
  /** Vu par la personne connectée. L'absence de ligne en base vaut « non lu ». */
  read: boolean
}

export interface NotificationFeed {
  /** Non lues parmi les actives : le nombre de la pastille rouge. */
  unread: number
  /** Non lues de sévérité `critical` ou `blocking` : ce qui justifie le son. */
  unreadCritical: number
  /** Actives, lues ou non. */
  active: number
  items: NotificationItem[]
  /** Instant de la réponse, pour que l'écran sache de quand date ce qu'il montre. */
  at: string
}

/** Une alerte demande-t-elle une action MAINTENANT ? */
function isActive(alert: AlertView, now: string): boolean {
  return alert.state === 'open' || (alert.state === 'snoozed' && (alert.snoozedUntilAt ?? '') <= now)
}

/**
 * Le nombre d'éléments rendus à la cloche.
 *
 * Douze, et pas « toutes » : un menu déroulant qui défile sur trois cents lignes n'est
 * pas un menu, c'est une seconde page mal faite. Le compteur, lui, reste exact — c'est
 * la LISTE qui est bornée, jamais le décompte.
 */
const FEED_SIZE = 12

/**
 * Dernier recalcul par organisation, en MÉMOIRE DE PROCESSUS.
 *
 * Volontairement pas en base. Ce n'est pas une donnée, c'est un amortisseur : dix
 * onglets ouverts sur la même agence ne doivent pas déclencher dix balayages par
 * minute. Le perdre au redémarrage ne coûte qu'un balayage de plus, et le balayage est
 * idempotent.
 *
 * En production (Phase 12), plusieurs instances auront chacune la leur : au pire un
 * balayage par instance et par minute, ce qui reste sans effet puisque `pg_cron` fait
 * déjà le travail de fond. C'est la raison pour laquelle cet amortisseur n'a pas
 * besoin d'être partagé.
 */
const lastScanByOrg = new Map<string, number>()
const RESCAN_EVERY_MS = 60_000

/**
 * Consultation de la cloche — et entretien du moteur au passage.
 *
 * **`POST` et non `GET`, délibérément.** Cette fonction peut ÉCRIRE : au plus une fois
 * par minute et par organisation, elle relance le balayage des échéances. La déclarer
 * en `GET` en ferait une lecture aux yeux de tout le monde — cache, journaux,
 * relecture — alors qu'elle a un effet. Le verbe dit la vérité.
 *
 * Le balayage tourne en contexte SYSTÈME, comme celui de `node-cron`, et pas avec les
 * droits de la personne connectée. C'est ce qui permet à un rôle `viewer`, ou à une
 * agence gelée par un impayé, de voir ses échéances se mettre à jour : constater une
 * échéance n'a jamais demandé le droit d'écrire.
 */
export const pollNotifications = createServerFn({ method: 'POST' })
  .middleware([tenantMiddleware])
  .handler(async ({ context }): Promise<NotificationFeed> => {
    const tenant = context.tenant
    const db = getDb()

    const since = lastScanByOrg.get(tenant.orgId) ?? 0
    if (Date.now() - since >= RESCAN_EVERY_MS) {
      // Posé AVANT le balayage : un balayage lent ne doit pas laisser passer dix
      // requêtes concurrentes pendant qu'il tourne.
      lastScanByOrg.set(tenant.orgId, Date.now())
      try {
        await runAlertScan(db, systemContext(tenant.orgId, tenant.planCode))
      } catch (error) {
        // Un balayage en échec ne doit pas priver l'écran de ses notifications :
        // on rend ce qu'on a déjà en base plutôt que rien.
        console.error(`[alertes] balayage à la volée échoué pour ${tenant.orgId}`, error)
      }
    }

    const repository = alertRepository(db, tenant)
    const rows = await repository.live()
    const readIds = await repository.readIdsFor(tenant.userId)
    const now = new Date().toISOString()

    const active = rows.map(toView).filter((alert) => isActive(alert, now))
    const unread = active.filter((alert) => !readIds.has(alert.id))

    return {
      unread: unread.length,
      unreadCritical: unread.filter(
        (alert) => alert.severity === 'critical' || alert.severity === 'blocking',
      ).length,
      active: active.length,
      items: [...active]
        .sort(bySeverityThenDue)
        // Les non lues d'abord : la cloche s'ouvre sur ce qu'on n'a pas encore vu.
        .sort((a, b) => Number(readIds.has(a.id)) - Number(readIds.has(b.id)))
        .slice(0, FEED_SIZE)
        .map((alert) => ({ ...alert, read: readIds.has(alert.id) })),
      at: now,
    }
  })

export const MarkReadInput = z.object({
  /** Vide ou absent = tout ce qui est actif. C'est le « tout marquer comme lu ». */
  ids: z.array(z.string().min(1)).max(500).optional(),
})

/**
 * Marque des notifications comme lues, pour la personne connectée et elle seule.
 *
 * **`tenantMiddleware` et non `writableTenantMiddleware`, et ce n'est pas un oubli.**
 * Une lecture n'est pas une écriture métier : un rôle `viewer` doit pouvoir faire
 * taire sa propre pastille, et une agence gelée par un impayé aussi — lui refuser
 * reviendrait à la punir deux fois.
 *
 * Le seul cas refusé est l'ADMINISTRATEUR QUI CONSULTE sans être élevé. La raison
 * n'est pas un droit d'écriture manquant : c'est qu'il est dans la peau du
 * propriétaire, et que marquer comme lues les notifications de quelqu'un d'autre les
 * lui ferait manquer. L'élévation explicite lève cette réserve, comme pour le reste.
 */
export const markNotificationsRead = createServerFn({ method: 'POST' })
  .middleware([tenantMiddleware])
  .validator(MarkReadInput)
  .handler(async ({ data, context }): Promise<{ marked: number }> => {
    const tenant = context.tenant
    if (tenant.impersonated && !tenant.canWrite) {
      throw new ForbiddenError('impersonation is read-only')
    }

    const db = getDb()
    const repository = alertRepository(db, tenant)
    const now = new Date().toISOString()

    let ids = data.ids ?? []
    if (ids.length === 0) {
      const rows = await repository.live()
      ids = rows.map(toView).filter((alert) => isActive(alert, now)).map((alert) => alert.id)
    } else {
      /*
       * Les identifiants viennent du navigateur : on ne les écrit pas sur parole.
       * Le repository filtre déjà par `org_id`, donc une alerte d'une autre agence ne
       * serait de toute façon pas lisible — mais elle produirait ici une ligne de
       * lecture orpheline, qui n'est bonne à rien et fausserait un futur décompte.
       */
      const known = new Set((await repository.live()).map((row) => row.id))
      ids = ids.filter((id) => known.has(id))
    }

    const marked = await repository.markRead(ids, tenant.userId, now)
    return { marked }
  })

/**
 * Recalcul à la demande.
 *
 * En développement, `node-cron` le déclenche toutes les heures ; en production, ce
 * sera `pg_cron` appelant une Edge Function qui importe la MÊME logique. Ce bouton
 * existe pour ne pas avoir à attendre l'heure quand on vient de saisir un document.
 */
export const rescanAlerts = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .handler(async ({ context }) => {
    return runAlertScan(getDb(), context.tenant)
  })

const AlertIdInput = z.object({ id: z.string().min(1) })

export const SnoozeAlertInput = AlertIdInput.extend({
  /** Report en jours. Borné : au-delà d'un mois, ce n'est plus un report, c'est un oubli. */
  days: z.int().min(1).max(30),
})

export const snoozeAlert = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(SnoozeAlertInput)
  .handler(async ({ data, context }) => {
    const repository = forOrg<typeof alerts.$inferSelect>(getDb(), context.tenant, alerts)
    const updated = await repository.update(data.id, {
      state: 'snoozed',
      snoozedUntilAt: `${addCivilDays(new Date().toISOString().slice(0, 10), data.days)}T00:00:00.000Z`,
    })
    if (!updated) throw notFound()
    return { ok: true }
  })

/**
 * « Traité » : la personne dit avoir fait le nécessaire.
 *
 * L'alerte ne disparaît pas de l'historique et le moteur la rouvrira au prochain
 * seuil si la cause n'a pas bougé — dire qu'on a payé ne paie pas la vignette.
 */
export const acknowledgeAlert = createServerFn({ method: 'POST' })
  .middleware([writableTenantMiddleware])
  .validator(AlertIdInput)
  .handler(async ({ data, context }) => {
    const repository = forOrg<typeof alerts.$inferSelect>(getDb(), context.tenant, alerts)
    const updated = await repository.update(data.id, {
      state: 'acknowledged',
      acknowledgedBy: context.tenant.userId,
    })
    if (!updated) throw notFound()
    return { ok: true }
  })
