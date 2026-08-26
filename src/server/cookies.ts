/**
 * `set-cookie` → `cookie`, avec la sémantique d'un navigateur.
 *
 * Better Auth pose plusieurs cookies dans une même réponse — l'impersonation en pose
 * six, dont trois suppressions. Deux pièges rencontrés en Phase 2 :
 *
 *  - `headers.get('set-cookie')` ne renvoie que le PREMIER, souvent une suppression ;
 *  - concaténer tous les `set-cookie` place le jeton vide avant le bon, et le serveur
 *    lit le premier — d'où un « Unauthorized » incompréhensible.
 *
 * On garde donc, par nom, la DERNIÈRE valeur, et on jette les suppressions.
 */
export function cookieHeaderFrom(setCookies: ReadonlyArray<string>): Headers {
  const jar = new Map<string, string>()

  for (const entry of setCookies) {
    const [pair, ...attributes] = entry.split(';')
    const separator = pair?.indexOf('=') ?? -1
    if (!pair || separator === -1) continue

    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    const deleted =
      value === '' || attributes.some((attribute) => /^\s*max-age\s*=\s*0\s*$/i.test(attribute))

    if (deleted) jar.delete(name)
    else jar.set(name, value)
  }

  const headers = new Headers()
  if (jar.size > 0) {
    headers.set('cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '))
  }
  return headers
}
