import type { NotificationMessage, Notifier } from './notifier'

/**
 * ZOHO — l'envoi transactionnel réel.
 *
 * **Le service visé est ZeptoMail, pas Zoho Mail.** Ce sont deux produits distincts et
 * les confondre coûte la délivrabilité : Zoho Mail est une boîte aux lettres, prévue
 * pour qu'un humain écrive à un humain, et ses limites d'envoi comme sa réputation
 * d'expéditeur sont calibrées pour ça. ZeptoMail est le canal TRANSACTIONNEL de Zoho —
 * infrastructure séparée, réservée aux messages déclenchés par une action, donc jamais
 * mêlée à des envois marketing. Une alerte d'échéance qui part par la boîte aux
 * lettres finit en indésirable, et personne ne s'en aperçoit avant le premier client
 * fâché.
 *
 * **Aucune dépendance ajoutée.** L'API est du HTTP et `fetch` est natif depuis Node 18.
 * Un client SMTP aurait apporté un arbre de dépendances entier pour une seule requête
 * POST, et `pnpm check:budget` a raison de compter.
 *
 * Ce module ne touche NI la base NI un module Node : il est chargé par `src/start.ts`
 * derrière un `import()` sous `import.meta.env.SSR`, donc il n'entre jamais dans le
 * paquet client — pas plus que la clé qu'il lit.
 */

/**
 * Les centres de données de ZeptoMail.
 *
 * Le domaine d'API dépend du centre où le compte a été OUVERT, et il n'est pas
 * interchangeable : une clé européenne présentée à `.com` est refusée. Le compte se
 * déclare donc explicitement plutôt que d'être deviné.
 *
 * Pour un compte marocain, `eu` est le choix courant — c'est le centre le plus proche,
 * et celui qui évite un transfert de données hors d'Europe pour des adresses de
 * clients européens en location saisonnière.
 */
const API_HOSTS = {
  com: 'api.zeptomail.com',
  eu: 'api.zeptomail.eu',
  in: 'api.zeptomail.in',
  au: 'api.zeptomail.com.au',
  jp: 'api.zeptomail.jp',
  ca: 'api.zeptomail.ca',
  sa: 'api.zeptomail.sa',
} as const

export type ZohoRegion = keyof typeof API_HOSTS

export function isZohoRegion(value: unknown): value is ZohoRegion {
  return typeof value === 'string' && value in API_HOSTS
}

export interface ZohoConfig {
  /** Jeton « Send Mail », préfixé `Zoho-enczapikey` à l'envoi. */
  token: string
  region: ZohoRegion
  from: { address: string; name?: string }
}

/**
 * `"Flotta <no-reply@flotta.ma>"` → `{ name: 'Flotta', address: 'no-reply@flotta.ma' }`.
 *
 * La forme nue `no-reply@flotta.ma` est acceptée aussi. Le nom est facultatif côté
 * ZeptoMail ; l'adresse ne l'est pas, et elle doit appartenir à un domaine VÉRIFIÉ
 * chez Zoho — sinon l'API refuse le message, ce qui est le bon comportement : un
 * expéditeur non vérifié serait de toute façon rejeté par le destinataire.
 */
export function parseFromAddress(raw: string): { address: string; name?: string } | null {
  const angled = /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(raw)
  if (angled) {
    const name = angled[1]?.replace(/^"|"$/g, '').trim()
    const address = angled[2]
    if (!address) return null
    return name ? { address, name } : { address }
  }

  const bare = raw.trim()
  return /^[^<>\s]+@[^<>\s]+$/.test(bare) ? { address: bare } : null
}

/**
 * Le corps en texte brut, transformé en HTML minimal.
 *
 * Beaucoup de clients de messagerie affichent mal un message purement textuel — sur
 * mobile, Gmail le rend en police à chasse fixe. On envoie donc les DEUX versions, et
 * le HTML est engendré à partir du texte plutôt que rédigé à part : deux gabarits à
 * maintenir finissent toujours par diverger, et c'est la version qu'on ne relit pas
 * qui part au client.
 *
 * L'échappement n'est pas une précaution de style : le nom et le message viennent d'un
 * formulaire PUBLIC. Sans lui, un prospect nommé `<script>` injecterait du balisage
 * dans la boîte de réception du commercial.
 */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** 10 s : au-delà, l'envoi est perdu de toute façon, et l'appelant attend. */
const TIMEOUT_MS = 10_000

export function createZohoNotifier(config: ZohoConfig): Notifier {
  const endpoint = `https://${API_HOSTS[config.region]}/v1.1/email`

  return {
    id: `zoho:${config.region}`,

    async send(message: NotificationMessage): Promise<void> {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          /*
           * Le préfixe fait partie de la valeur d'en-tête, ce n'est pas un schéma
           * d'authentification HTTP standard. `Bearer <jeton>` est refusé par ZeptoMail.
           */
          Authorization: `Zoho-enczapikey ${config.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          from: { address: config.from.address, name: config.from.name },
          to: [{ email_address: { address: message.to } }],
          subject: message.subject,
          textbody: message.body,
          htmlbody: message.html ?? textToHtml(message.body),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!response.ok) {
        /*
         * Le corps de la réponse est lu et RAPPORTÉ : ZeptoMail y explique le refus —
         * domaine non vérifié, jeton révoqué, destinataire en liste noire. Un « 401 »
         * nu enverrait chercher pendant une heure.
         *
         * Le jeton, lui, n'apparaît nulle part dans ce message : il ne figure que dans
         * l'en-tête, et `notifications.error` finit en base.
         */
        const detail = await response.text().catch(() => '')
        throw new Error(`zeptomail ${response.status}: ${detail.slice(0, 500)}`)
      }
    },
  }
}

/**
 * Le notificateur Zoho tel que l'environnement le décrit, ou `null`.
 *
 * `null` plutôt qu'une exception, et c'est délibéré : une configuration incomplète
 * doit faire retomber le produit sur la console, pas l'empêcher de démarrer. Un
 * serveur qui refuse de se lever parce qu'une clé de courriel manque transforme un
 * réglage oublié en panne totale.
 *
 * L'appelant AVERTIT quand il retombe — un envoi silencieusement désactivé en
 * production est exactement le genre de panne qu'on découvre trois semaines plus tard.
 */
export function zohoNotifierFromEnv(): Notifier | null {
  const token = process.env['ZOHO_ZEPTOMAIL_TOKEN']
  const rawFrom = process.env['NOTIFY_FROM']
  const rawRegion = process.env['ZOHO_REGION'] ?? 'eu'

  if (!token || !rawFrom) return null
  if (!isZohoRegion(rawRegion)) return null

  const from = parseFromAddress(rawFrom)
  if (!from) return null

  return createZohoNotifier({ token, region: rawRegion, from })
}
