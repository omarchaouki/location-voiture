/**
 * Crée le compte de super administrateur — le tien.
 *
 *   pnpm admin:create --email toi@exemple.ma --name "Ton Nom"
 *   pnpm admin:create --email toi@exemple.ma --name "Ton Nom" --password "…"
 *
 * Sans `--password`, le mot de passe est demandé et n'apparaît ni à l'écran ni dans
 * l'historique du terminal.
 *
 * Il n'existe AUCUN formulaire web équivalent : le rôle de plateforme ne s'obtient
 * que par cette commande, sur la machine qui a accès à la base.
 */

import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'

import { createPlatformOwner } from '~/auth/bootstrap'
import { createAuth } from '~/auth/server'
import { createDb, resolveDatabaseFile } from '~/db/client'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

/** Demande un mot de passe sans l'afficher ni le laisser dans l'historique. */
async function askHidden(question: string): Promise<string> {
  let muted = false
  const output = new Writable({
    write(chunk: unknown, _encoding: BufferEncoding, done: () => void) {
      if (!muted) process.stdout.write(chunk as string)
      done()
    },
  })

  const rl = createInterface({ input: process.stdin, output, terminal: true })
  process.stdout.write(question)
  muted = true
  const answer = await rl.question('')
  muted = false
  process.stdout.write('\n')
  rl.close()
  return answer.trim()
}

async function main(): Promise<void> {
  const email = argument('email')
  const name = argument('name')

  if (!email || !name) {
    console.error('Usage : pnpm admin:create --email <adresse> --name "<nom>" [--password <mdp>]')
    process.exit(1)
  }

  const password = argument('password') ?? (await askHidden('Mot de passe (10 caractères minimum) : '))
  if (password.length < 10) {
    console.error('Mot de passe trop court : 10 caractères minimum.')
    process.exit(1)
  }

  const file = resolveDatabaseFile()
  const db = createDb(file)
  const auth = createAuth(db)

  const { userId } = await createPlatformOwner(db, auth, { email, password, name })

  console.log('')
  console.log(`Compte de plateforme créé sur ${file}`)
  console.log(`  identifiant : ${userId}`)
  console.log(`  adresse     : ${email}`)
  console.log('')
  console.log("Connecte-toi sur /fr/connexion, puis va sur /fr/admin.")
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
