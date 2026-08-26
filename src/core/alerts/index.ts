import { ALERT_RULES } from './rules'
import type { AlertDraft, AlertSnapshot } from './types'

export * from './types'
export { ALERT_RULES } from './rules'
export { expiryThreshold, latenessThreshold, hoursSince } from './thresholds'

/**
 * Évalue toutes les règles sur un instantané.
 *
 * **Idempotent par construction** : la fonction est pure, donc deux appels sur les
 * mêmes données donnent exactement le même résultat. La persistance s'appuie ensuite
 * sur un index unique — relancer le job dix fois ne crée rien de nouveau, et c'est
 * l'index qui le garantit, pas la discipline du code.
 */
export function evaluateAlerts(snapshot: AlertSnapshot): AlertDraft[] {
  const drafts = ALERT_RULES.flatMap((rule) => rule.evaluate(snapshot))

  /*
   * Déduplication par identité.
   *
   * Deux documents peuvent viser la même échéance — deux polices marquées courantes
   * sur le même véhicule, par exemple, ce qui ne devrait pas arriver mais arrive.
   * L'index unique en base les avalerait silencieusement ; on préfère que le moteur
   * dise clairement qu'il n'émet qu'une intention par identité. Cas trouvé par le
   * test, pas en production.
   */
  const unique = new Map<string, AlertDraft>()
  for (const draft of drafts) {
    const key = identityOf(draft)
    if (!unique.has(key)) unique.set(key, draft)
  }

  // Ordre stable : deux exécutions produisent la même liste, dans le même ordre.
  // Sans cela, comparer deux passages devient impossible et les tests deviennent
  // sensibles à l'ordre d'itération.
  return [...unique.values()].sort((a, b) => identityOf(a).localeCompare(identityOf(b)))
}

/** L'identité qui porte l'unicité en base. Une seule définition, partagée. */
export function identityOf(draft: AlertDraft): string {
  return [draft.entityType, draft.entityId, draft.alertType, draft.thresholdKey, draft.periodKey].join(
    '|',
  )
}

/**
 * Identité SANS le seuil : tout ce qui concerne la même échéance.
 *
 * Sert à clore les seuils précédents quand un plus grave apparaît — à J-7, l'alerte
 * J-30 de la même police n'a plus de raison de rester ouverte.
 */
export function deadlineOf(draft: AlertDraft): string {
  return [draft.entityType, draft.entityId, draft.alertType, draft.periodKey].join('|')
}
