import { createStart, createCsrfMiddleware } from '@tanstack/react-start'

/**
 * Point de configuration global du serveur.
 *
 * **Deux pièges, tous deux payés comptant.**
 *
 * 1. Dès qu'on écrit ce fichier, la protection CSRF n'est plus implicite : elle est
 *    donc déclarée explicitement ci-dessous (`TODO` de la Phase 1, docs/DECISIONS.md
 *    §2.1). L'oublier ouvrirait toutes les server functions aux requêtes inter-sites.
 *
 * 2. Ce module est évalué **sur le client AUSSI**. Y importer un module Node — ici
 *    l'ordonnanceur, qui dépend de `node-cron` — envoie ce paquet dans le navigateur,
 *    où il casse au chargement et fait échouer silencieusement toutes les mutations.
 *    Constaté pour de vrai : « Class extends value undefined » dans la console, et
 *    des boutons qui ne faisaient plus rien.
 *
 *    D'où l'`import()` dynamique sous `import.meta.env.SSR` : la condition est une
 *    constante de compilation, donc Vite supprime complètement la branche du paquet
 *    client. C'est la seule forme sur laquelle on peut compter.
 */
/**
 * LE CANAL D'ENVOI, choisi une fois au démarrage.
 *
 * Hors de la condition `NODE_ENV` ci-dessous : les ordonnanceurs sont un artifice de
 * développement — en production c'est `pg_cron` qui les remplace —, l'envoi de
 * courriels, lui, sert surtout EN production. Les confondre aurait donné un serveur de
 * production qui écrit ses notifications dans la sortie standard.
 *
 * Le `import()` dynamique sous `import.meta.env.SSR` suit exactement la règle du point
 * 2 ci-dessous : la condition est une constante de compilation, Vite supprime la
 * branche entière du paquet client, et la clé Zoho ne peut donc pas y entrer.
 */
if (import.meta.env.SSR) {
  void (async () => {
    const provider = process.env['NOTIFIER'] ?? 'console'
    if (provider !== 'zoho') return

    const [{ setNotifier }, { zohoNotifierFromEnv }] = await Promise.all([
      import('~/server/notifier'),
      import('~/server/notifier-zoho'),
    ])

    const notifier = zohoNotifierFromEnv()
    if (notifier) {
      setNotifier(notifier)
      return
    }

    /*
     * Configuration incomplète : on reste sur la console, mais on le DIT. Un envoi
     * silencieusement désactivé en production est le genre de panne qu'on découvre
     * trois semaines plus tard, en cherchant pourquoi un client n'a jamais reçu son
     * invitation.
     */
    console.warn(
      'NOTIFIER=zoho mais la configuration est incomplète ' +
        '(ZOHO_ZEPTOMAIL_TOKEN, NOTIFY_FROM, ZOHO_REGION) — envoi en mode console.',
    )
  })()
}

/**
 * L'ORDONNANCEUR — et pourquoi il tourne AUSSI en production.
 *
 * Ce bloc portait « en production, c'est `pg_cron` qui appellera la même logique ».
 * `pg_cron` n'a jamais été écrit, et la condition excluait la production : déployé tel
 * quel, le produit n'aurait balayé aucune échéance, ingéré aucune position, ouvert
 * aucune période de facturation. Le cœur du produit — l'alerte — ne se serait jamais
 * déclenché, sans une seule erreur dans les journaux.
 *
 * Sur la topologie réelle (UN processus Node sur un Lightsail, Postgres chez Supabase),
 * l'ordonnanceur en processus est le bon outil : il partage la connexion, le fuseau et
 * les journaux du serveur. `pg_cron` obligerait Supabase à rappeler l'application par
 * HTTP, donc à exposer et authentifier quatre points d'entrée de plus, pour rien.
 *
 * `ENABLE_CRON` reste explicite en production, et ce n'est pas de la cérémonie : le jour
 * où un second processus servira le trafic, deux ordonnanceurs balayeraient les mêmes
 * échéances en parallèle. Les tâches sont idempotentes, mais les notifications, elles,
 * partiraient en double. Un seul processus doit porter `ENABLE_CRON=true`.
 */
const cronEnabled =
  process.env['ENABLE_CRON'] === 'true' ||
  (process.env['ENABLE_CRON'] !== 'false' && process.env['NODE_ENV'] !== 'production')

if (import.meta.env.SSR && cronEnabled) {
  void import('~/server/alert-cron').then((module) => {
    module.startAlertCron()
  })
  void import('~/server/gps-cron').then((module) => {
    module.startGpsCron()
  })
  void import('~/server/billing-cron').then((module) => {
    module.startBillingCron()
  })
  void import('~/server/demo-cron').then((module) => {
    module.startDemoCron()
  })
}

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: (ctx) => ctx.handlerType === 'serverFn',
    }),
  ],
}))
