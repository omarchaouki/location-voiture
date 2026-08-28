import type { Locale } from '~/i18n/locales'

/**
 * ACCUSÉ DE RÉCEPTION d'une demande de démonstration.
 *
 * Le seul courriel que le produit envoie à quelqu'un qui n'est pas encore client, et
 * le premier contact qu'il aura avec la marque. Trois règles le tiennent :
 *
 * **1. Il est écrit dans LA LANGUE DU FORMULAIRE.** `leads.locale` est enregistré
 * précisément pour ça. Répondre en français à quelqu'un qui a rempli la page en arabe
 * annule tout ce que la section « Fait pour le Maroc » vient de promettre.
 *
 * **2. Les gabarits vivent ICI, pas dans les fichiers de `src/i18n/locales/`.** Ce
 * n'est pas un oubli : ces fichiers sont chargés par le NAVIGATEUR, et y ranger des
 * gabarits de courriel les enverrait dans le paquet client — trois langues de texte
 * que personne n'affichera jamais à l'écran. La contrepartie est qu'ils échappent au
 * test de parité, d'où le `Record<Locale, …>` ci-dessous : c'est le TYPE qui rend une
 * langue manquante impossible, et il échoue à la compilation plutôt qu'à l'envoi.
 *
 * **3. Il ne promet RIEN que l'accusé de réception.** Pas de lien de connexion, pas de
 * mot de passe, pas de pièce jointe — un premier courriel qui en contient finit en
 * indésirable, et c'est le seul qu'on ne peut pas se permettre d'y voir arriver.
 */

export interface LeadAckMessage {
  subject: string
  body: string
}

/**
 * `Record<Locale, …>` et non un objet libre : ajouter une quatrième langue au produit
 * fera échouer la COMPILATION de ce fichier tant que son gabarit manque. C'est le
 * remplaçant du test de parité, pour du texte que le navigateur ne verra jamais.
 */
const TEMPLATES: Record<Locale, (name: string) => LeadAckMessage> = {
  fr: (name) => ({
    subject: 'Votre demande de démonstration Flotta',
    body: [
      `Bonjour ${name},`,
      '',
      'Nous avons bien reçu votre demande et nous vous rappelons sous un jour ouvré.',
      '',
      "L'appel dure une quinzaine de minutes : vous nous décrivez votre flotte, nous vous montrons Flotta sur des données proches des vôtres, et nous ouvrons votre espace si cela vous convient.",
      '',
      "Si vous préférez être rappelé à un moment précis, répondez simplement à ce message.",
      '',
      "À très vite,",
      "L'équipe Flotta",
    ].join('\n'),
  }),

  ar: (name) => ({
    subject: 'طلبكم لعرض توضيحي من Flotta',
    body: [
      `مرحبا ${name}،`,
      '',
      'توصلنا بطلبكم وسنتصل بكم خلال يوم عمل واحد.',
      '',
      'تدوم المكالمة حوالي خمس عشرة دقيقة: تصفون لنا أسطولكم، ونعرض عليكم Flotta ببيانات قريبة من بياناتكم، ثم نفتح لكم حسابكم إذا ناسبكم ذلك.',
      '',
      'إذا كنتم تفضلون أن نتصل بكم في وقت محدد، يكفي أن تردوا على هذه الرسالة.',
      '',
      'إلى اللقاء،',
      'فريق Flotta',
    ].join('\n'),
  }),

  en: (name) => ({
    subject: 'Your Flotta demo request',
    body: [
      `Hello ${name},`,
      '',
      'We have received your request and will call you back within one working day.',
      '',
      'The call takes about fifteen minutes: you describe your fleet, we show you Flotta on data close to your own, and we open your workspace if it suits you.',
      '',
      'If you would rather be called at a specific time, just reply to this message.',
      '',
      'Talk soon,',
      'The Flotta team',
    ].join('\n'),
  }),
}

export function leadAckMessage(locale: Locale, name: string): LeadAckMessage {
  return TEMPLATES[locale](name)
}
