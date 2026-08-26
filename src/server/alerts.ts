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
import { tenantMiddleware, writableTenantMiddleware } from './middleware'

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
  .handler(async ({ context }): Promise<AlertView[]> => {
    const rows = await liveAlerts(getDb(), context.tenant)
    const now = new Date().toISOString()

    return rows
      .map(toView)
      .sort((a, b) => {
        const snoozedA = a.state === 'snoozed' && (a.snoozedUntilAt ?? '') > now ? 1 : 0
        const snoozedB = b.state === 'snoozed' && (b.snoozedUntilAt ?? '') > now ? 1 : 0
        if (snoozedA !== snoozedB) return snoozedA - snoozedB

        const severity =
          (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
        if (severity !== 0) return severity

        return (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999')
      })
  })

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
