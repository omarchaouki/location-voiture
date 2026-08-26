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
if (import.meta.env.SSR && process.env['NODE_ENV'] !== 'production') {
  // En production, c'est `pg_cron` qui appellera la même logique (Phase 12).
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
