/**
 * Remplit une organisation RÉELLE d'un jeu de démonstration, à la taille demandée.
 *
 *   pnpm demo:fill --org <slug|id> [--vehicles 30] [--customers 100] [--history 3]
 *
 * À ne pas confondre avec `pnpm seed`, qui peuple les deux espaces PARTAGÉS
 * (`demo-atlas`, `demo-sahara`) remis à zéro chaque nuit. Celui-ci vise un compte
 * ordinaire — le vôtre, celui d'un client en essai — pour qu'il ait de quoi montrer
 * des listes pleines, des totaux qui bougent et des alertes qui tombent.
 *
 * **Il EFFACE avant d'écrire.** C'est le même geste que la réinitialisation nocturne,
 * et pour la même raison : semer par-dessus l'existant ferait entrer en collision les
 * plaques et les références de contrat, qui sont uniques par organisation. La commande
 * annonce donc ce qu'elle va effacer, et exige `--confirm <slug>` dès qu'il y a
 * quelque chose à perdre.
 *
 * Le jeu écrit ici n'est pas marqué : ce sont des lignes ordinaires, indistinguables
 * de vraies données. C'est voulu — un jeu marqué ne prouverait rien sur le produit.
 * La contrepartie est que `pnpm demo:purge` efface TOUT ce que l'organisation possède,
 * pas seulement ce que cette commande a posé.
 */

import { closeDb, createDb, resolveDatabaseUrl } from '~/db/client'
import { runAlertScan } from '~/server/alert-scan'
import type { DemoSize } from '~/server/demo/dataset'
import { countOrganizationRows, purgeOrganizationData } from '~/server/demo/reset'
import { seedDemoOrganization } from '~/server/demo/seed'
import { planLimits } from '~/server/plan'
import { refreshUsageCounters } from '~/server/quota'
import { systemContext } from '~/server/system-context'
import { businessCivilDate } from '~/i18n/format'
import { assertConfirmed, numberFlag, resolveOrg } from './org-target'

const argv = process.argv.slice(2)
const db = createDb(resolveDatabaseUrl())

try {
  const target = await resolveOrg(db, argv)

  const size: DemoSize = {
    vehicles: numberFlag(argv, 'vehicles', 30),
    customers: numberFlag(argv, 'customers', 100),
    historyPerVehicle: numberFlag(argv, 'history', 3),
  }

  console.log(`cible   : ${target.name} (${target.slug}) — offre ${target.planCode}, ${target.status}`)
  console.log(`volume  : ${size.vehicles} voitures, ${size.customers} clients, ${size.historyPerVehicle} contrats clos par voiture`)

  /*
   * LE QUOTA N'EST PAS APPLIQUÉ ICI, et il faut le dire.
   *
   * Le semeur passe par les repositories, qui cloisonnent mais ne comptent pas — le
   * contrôle d'offre vit dans la server function de création (`assertQuota`). Semer
   * trente voitures sur une offre qui en autorise dix laisse donc un compte cohérent
   * à l'affichage mais bloqué à la création. Mieux vaut le savoir avant que devant
   * l'écran.
   */
  const limits = await planLimits(target.planCode, db)
  if (limits.maxVehicles !== null && size.vehicles > limits.maxVehicles) {
    console.log(
      `ATTENTION : l'offre « ${target.planCode} » plafonne à ${limits.maxVehicles} voitures. ` +
        `Les ${size.vehicles} demandées seront écrites et s'afficheront, mais l'application ` +
        `refusera toute création supplémentaire tant que le quota est dépassé.`,
    )
  }

  const before = await countOrganizationRows(db, target.id, 'agency-data')
  if (before.total > 0) {
    console.log(`\nà effacer avant écriture — ${before.total} lignes :`)
    for (const [table, count] of Object.entries(before.byTable)) {
      console.log(`  ${table.padEnd(24)} ${count}`)
    }
    assertConfirmed(argv, target)
  }

  const cleared = await purgeOrganizationData(db, target.id, 'agency-data')

  const today = businessCivilDate(new Date())
  const ctx = systemContext(target.id, target.planCode)
  const result = await seedDemoOrganization(db, ctx, today, size)

  /*
   * Les compteurs affichés sont une photo, et elle vient d'être invalidée deux fois :
   * par la purge, puis par le semis. `assertQuota` compte le réel et se moque d'eux,
   * mais l'écran « Abonnement » les lit — sans ce recalcul il annoncerait zéro voiture
   * devant une flotte de trente.
   */
  await refreshUsageCounters(db, ctx)

  /*
   * LE BALAYAGE, sans quoi le remplissage ne sert à rien.
   *
   * Les échéances sont semées vivantes — une assurance expirée, une visite technique
   * dans huit jours, un contrat qui se termine demain — mais une alerte n'existe pas
   * parce qu'une date approche : elle existe parce que le moteur l'a écrite. Le cron
   * la produirait cette nuit ; on ne va pas attendre cette nuit pour regarder l'écran
   * le plus utile du produit.
   *
   * Il est idempotent par index unique : le passage du cron ne créera pas de doublon.
   */
  const scan = await runAlertScan(db, ctx)

  console.log(
    `\n${cleared.tablesCleared} tables vidées, puis au ${today} :\n` +
      `  ${result.vehicles} voitures\n` +
      `  ${result.customers} clients\n` +
      `  ${result.contracts} contrats\n` +
      `  ${result.documents} pièces (assurance, visite, vignette)\n` +
      `  ${result.fines} amendes\n` +
      `  ${result.devices} boîtiers GPS\n` +
      `  ${scan.created} alertes ouvertes par le balayage`,
  )
  console.log(
    `\nPour tout retirer : pnpm demo:purge --org ${target.slug} --confirm ${target.slug}`,
  )
} catch (error) {
  console.error(`échec : ${(error as Error).message}`)
  process.exitCode = 1
} finally {
  // Sans ça le pool postgres-js garde ses sockets et le script ne rend jamais la main.
  await closeDb(db)
}
