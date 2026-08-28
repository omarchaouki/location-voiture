import type { Locale } from '~/i18n/locales'

/**
 * Envoi de notifications — interface unique.
 *
 * Aucune partie du produit ne connaît le prestataire. En développement tout part
 * dans la console ; en production ce sera Resend (Phase 4). Le mode démonstration
 * aura son propre verrou : la notification est ENREGISTRÉE mais jamais ENVOYÉE
 * (`notifications.state = 'skipped_demo'`, Phase 10).
 */

export interface NotificationMessage {
  to: string
  subject: string
  /**
   * Texte brut — la version de RÉFÉRENCE, et la seule obligatoire.
   *
   * C'est elle qui est enregistrée dans `notifications.body`, donc elle qui sera
   * relue le jour où quelqu'un demandera ce qui est réellement parti. Un gabarit HTML
   * archivé se relit à coups de balises.
   */
  body: string
  /**
   * Version HTML, facultative.
   *
   * Sans elle, le prestataire engendre le HTML à partir du texte. Elle n'existe que
   * pour les messages dont la mise en forme porte du SENS — un tableau d'échéances,
   * un bouton d'invitation —, jamais pour habiller.
   */
  html?: string
  locale: Locale
}

export interface Notifier {
  readonly id: string
  send(message: NotificationMessage): Promise<void>
}

/**
 * Développement : rien ne part, tout s'affiche. C'est volontaire — on ne veut pas
 * envoyer un vrai email à un vrai loueur depuis une machine de développement.
 */
export const consoleNotifier: Notifier = {
  id: 'console',
  send(message) {
    console.warn(
      [
        '',
        '──────── notification (non envoyée, mode console) ────────',
        `à       : ${message.to}`,
        `langue  : ${message.locale}`,
        `objet   : ${message.subject}`,
        '',
        message.body,
        '──────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    )
    return Promise.resolve()
  },
}

let current: Notifier = consoleNotifier

export function getNotifier(): Notifier {
  return current
}

/** Utilisé par les tests et, plus tard, par le démarrage en production. */
export function setNotifier(notifier: Notifier): void {
  current = notifier
}
