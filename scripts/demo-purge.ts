/**
 * Rend une organisation à son état VIDE.
 *
 *   pnpm demo:purge --org <slug|id> --confirm <slug>
 *
 * C'est la sortie de `pnpm demo:fill` : elle efface les données de l'AGENCE — voitures,
 * clients, contrats, pièces, amendes, alertes, compteurs, notifications, positions GPS.
 * L'organisation, ses membres et son ABONNEMENT sont épargnés (`PurgeScope`) : on vide
 * l'agence, on ne ferme pas le compte. Un compte sans abonnement n'a plus d'offre, plus
 * de fin d'essai, et rien dans le produit ne sait lui en rendre un.
 *
 * **Suppression DURE**, comme celle de la démonstration nocturne, et pour la même
 * raison : un effacement doux laisserait s'empiler des jeux successifs invisibles.
 * C'est une purge documentée au sens de la règle 8 du projet.
 *
 * **Elle n'efface pas « les données de démonstration » — elle efface TOUT.** Le jeu
 * semé n'est marqué nulle part, précisément pour qu'il ressemble à de vraies données ;
 * il n'existe donc aucun moyen de le distinguer d'une saisie faite à la main entre
 * temps. C'est pourquoi la commande dit ce qu'elle voit avant d'agir, et pourquoi elle
 * exige qu'on retape le slug de la cible.
 */

import { closeDb, createDb, resolveDatabaseUrl } from '~/db/client'
import { countOrganizationRows, purgeOrganizationData } from '~/server/demo/reset'
import { assertConfirmed, resolveOrg } from './org-target'

const argv = process.argv.slice(2)
const db = createDb(resolveDatabaseUrl())

try {
  const target = await resolveOrg(db, argv)
  console.log(`cible : ${target.name} (${target.slug}) — offre ${target.planCode}, ${target.status}`)

  const before = await countOrganizationRows(db, target.id, 'agency-data')
  if (before.total === 0) {
    console.log('rien à effacer : cette organisation est déjà vide.')
  } else {
    console.log(`\n${before.total} lignes vont être effacées :`)
    for (const [table, count] of Object.entries(before.byTable)) {
      console.log(`  ${table.padEnd(24)} ${count}`)
    }

    assertConfirmed(argv, target)

    const cleared = await purgeOrganizationData(db, target.id, 'agency-data')
    const after = await countOrganizationRows(db, target.id, 'agency-data')

    console.log(`\n${cleared.tablesCleared} tables traitées, ${before.total - after.total} lignes effacées.`)
    if (after.total > 0) {
      console.log(`restant : ${JSON.stringify(after.byTable)}`)
    }
  }

  console.log("\nL'organisation, ses membres et son abonnement sont intacts.")
} catch (error) {
  console.error(`échec : ${(error as Error).message}`)
  process.exitCode = 1
} finally {
  // Sans ça le pool postgres-js garde ses sockets et le script ne rend jamais la main.
  await closeDb(db)
}
