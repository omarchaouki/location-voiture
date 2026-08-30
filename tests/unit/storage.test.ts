import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { decodeDataUrl, UploadRefused } from '~/server/file-intake'
import {
  contentTypeOf,
  createLocalStorage,
  keyBelongsTo,
  MAX_UPLOAD_BYTES,
  resolveStorageProvider,
  storageKey,
} from '~/server/storage'

/**
 * LE STOCKAGE DE FICHIERS — la partie où une erreur sert des octets à la mauvaise
 * agence, ou remplit le disque.
 *
 * Quatre propriétés à tenir, et les deux premières sont des propriétés de SÛRETÉ :
 *
 *  1. **une clé ne sort pas de son organisation**, ni par un préfixe voisin, ni par une
 *     remontée de répertoire. C'est le seul contrôle entre la session et les octets
 *     servis par `/api/fichiers/*` ;
 *  2. **le fournisseur local ne lit rien hors de son dossier**, même si on lui présente
 *     une clé forgée — la clé devient un chemin, et un chemin remonte ;
 *  3. le type déclaré dans une `data:` URL est confronté à une liste blanche, jamais
 *     cru sur parole ;
 *  4. la taille est mesurée sur les octets DÉCODÉS, seul nombre qu'un appelant ne
 *     puisse pas mentir.
 */

const root = mkdtempSync(join(tmpdir(), 'flotta-storage-'))

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Un pixel PNG valide, en base64. Assez pour éprouver un aller-retour réel. */
const PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('appartenance d’une clé', () => {
  it('accepte une clé de son organisation', () => {
    expect(keyBelongsTo('org/abc/logo/1.webp', 'abc')).toBe(true)
  })

  it('refuse la clé d’une autre organisation', () => {
    expect(keyBelongsTo('org/xyz/logo/1.webp', 'abc')).toBe(false)
  })

  /**
   * LE PIÈGE DU PRÉFIXE.
   *
   * Une comparaison écrite `key.startsWith('org/' + orgId)` sans la barre oblique
   * finale laisserait l'organisation `abc` lire les fichiers de `abcdef`. Les
   * identifiants sont des UUID, donc la collision est improbable — mais « improbable »
   * n'est pas une propriété de sécurité.
   */
  it('refuse une organisation dont l’identifiant est un préfixe', () => {
    expect(keyBelongsTo('org/abcdef/logo/1.webp', 'abc')).toBe(false)
  })

  it('refuse une remontée de répertoire', () => {
    expect(keyBelongsTo('org/abc/../xyz/logo/1.webp', 'abc')).toBe(false)
  })

  it('produit des clés qui s’appartiennent', () => {
    const key = storageKey('abc', 'vehicle', 'image/webp')
    expect(keyBelongsTo(key, 'abc')).toBe(true)
    expect(key.endsWith('.webp')).toBe(true)
  })

  it('déduit le type de l’extension de la clé', () => {
    expect(contentTypeOf('org/a/logo/x.png')).toBe('image/png')
    expect(contentTypeOf('org/a/logo/x.webp')).toBe('image/webp')
    // Repli : une clé sans extension connue est traitée en JPEG.
    expect(contentTypeOf('org/a/logo/x')).toBe('image/jpeg')
  })
})

describe('fournisseur local', () => {
  const storage = createLocalStorage(root)

  it('écrit, relit, puis efface', async () => {
    const key = storageKey('org-alpha', 'logo', 'image/png')
    const bytes = Uint8Array.from(Buffer.from(PIXEL, 'base64'))

    await storage.put(key, { bytes, contentType: 'image/png' })

    const read = await storage.get(key)
    expect(read?.contentType).toBe('image/png')
    expect(Buffer.from(read!.bytes).equals(Buffer.from(bytes))).toBe(true)

    await storage.remove(key)
    expect(await storage.get(key)).toBeNull()
  })

  /**
   * Un fichier effacé à la main sur le serveur, ou une base restaurée sans son volume,
   * ne doit pas faire tomber la fiche qui le référence : elle s'affiche sans image, ce
   * qui est un défaut visible et réparable.
   */
  it('rend `null` pour un fichier absent, sans lever', async () => {
    expect(await storage.get('org-alpha/logo/jamais-ecrit.webp')).toBeNull()
  })

  it('refuse d’écrire hors de son dossier', async () => {
    await expect(
      storage.put('../../evade.png', {
        bytes: Uint8Array.from([1]),
        contentType: 'image/png',
      }),
    ).rejects.toThrow(/invalid storage key/)
  })

  it('ne lit rien hors de son dossier', async () => {
    expect(await storage.get('../../../etc/passwd')).toBeNull()
  })
})

describe('choix du fournisseur', () => {
  it('prend le disque local par défaut', () => {
    expect(resolveStorageProvider({}).name).toBe('local')
  })

  /**
   * Une configuration Supabase incomplète NE retombe PAS en silence sur le disque
   * local : ce serait la pire des issues — une agence croirait ses fichiers partis chez
   * l'hébergeur alors qu'ils dorment sur une machine qui sera remplacée au prochain
   * déploiement. Même règle que pour le fournisseur GPS.
   */
  it('lève plutôt que de retomber en silence sur le local', () => {
    expect(() =>
      resolveStorageProvider({ STORAGE_PROVIDER: 'supabase' }),
    ).toThrow(/SUPABASE_URL/)
  })
})

describe('décodage d’une image reçue', () => {
  it('accepte un PNG en base64', () => {
    const file = decodeDataUrl(`data:image/png;base64,${PIXEL}`)
    expect(file.contentType).toBe('image/png')
    expect(file.bytes.byteLength).toBeGreaterThan(0)
  })

  /**
   * LE SVG EST REFUSÉ, et ce n'est pas une limitation : un SVG est un document XML qui
   * peut porter un `<script>`. Servi depuis notre domaine, il donnerait à quiconque
   * téléverse le droit d'exécuter du code dans la session de ses collègues.
   */
  it('refuse un SVG', () => {
    expect(() => decodeDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toThrow(
      UploadRefused,
    )
  })

  it('refuse ce qui n’est pas une data URL', () => {
    expect(() => decodeDataUrl('https://exemple.ma/photo.jpg')).toThrow(UploadRefused)
  })

  /**
   * La borne porte sur les octets DÉCODÉS : une chaîne base64 qui annonce quarante
   * kilo-octets peut en peser quatre mégaoctets une fois décodée, et c'est le disque
   * qui paie.
   */
  it('refuse une image plus lourde que la borne', () => {
    const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 7).toString('base64')
    expect(() => decodeDataUrl(`data:image/png;base64,${huge}`)).toThrow(UploadRefused)
  })

  it('refuse une image vide', () => {
    expect(() => decodeDataUrl('data:image/png;base64,')).toThrow(UploadRefused)
  })

  it('nomme le motif du refus', () => {
    try {
      decodeDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')
      expect.unreachable('aurait dû lever')
    } catch (error) {
      // Le motif remonte jusqu'à l'écran : « JPEG, PNG ou WebP », pas « une erreur ».
      expect((error as UploadRefused).reason).toBe('unsupported_type')
    }
  })
})
