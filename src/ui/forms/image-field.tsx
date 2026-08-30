import { useId, useRef, useState } from 'react'

import { Button } from '~/ui/shadcn/button'
import { cn } from '~/ui/shadcn/utils'

// i18n-exempt — cette primitive ne produit aucun texte : étiquette, aide, boutons et
// messages d'erreur lui sont passés déjà traduits par l'appelant.

/**
 * CHAMP IMAGE — choisir une photo, la voir, la remplacer, la retirer.
 *
 * **Le redimensionnement se fait dans le NAVIGATEUR, avant le moindre octet envoyé.**
 * C'est la décision qui fait tenir tout le reste : une photo prise au téléphone pèse
 * quatre mégaoctets, et un gérant qui saisit quarante voitures depuis le comptoir en
 * enverrait cent soixante. Ramenée à 640 px et réencodée en WebP, la même photo pèse
 * une trentaine de kilo-octets — assez pour reconnaître une voiture dans une liste,
 * ce qui est tout ce qu'on lui demande. Le serveur n'a donc aucune bibliothèque de
 * traitement d'image à embarquer : il reçoit déjà la bonne taille, et se contente de
 * vérifier (`src/server/file-intake.ts`), parce qu'un client peut mentir.
 *
 * `createImageBitmap(file, { imageOrientation: 'from-image' })` applique l'orientation
 * EXIF. Sans elle, une photo prise en tenant le téléphone à l'horizontale arrive
 * COUCHÉE — le capteur enregistre toujours dans le même sens et note la rotation à
 * part, que le dessin sur canevas ignore.
 *
 * Le WebP est demandé, le JPEG assumé en repli : `toDataURL` d'un navigateur qui ne
 * connaît pas le type demandé rend silencieusement du PNG — soit dix fois le poids
 * d'un JPEG sur une photo. On vérifie donc l'en-tête de ce qui sort, au lieu de faire
 * confiance à ce qu'on a demandé.
 */

/** Côté maximal de l'image stockée. Une vignette de liste, pas une photo d'agence. */
const MAX_EDGE = 640

/** Au-delà, on ne tente même pas de décoder : c'est une vidéo ou un fichier brut. */
const MAX_SOURCE_BYTES = 20_000_000

export type ImagePickError = 'unsupported_type' | 'too_large' | 'decode_failed'

async function shrinkToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('unsupported_type')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('too_large')

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('decode_failed')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const webp = canvas.toDataURL('image/webp', 0.82)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82)
}

export function ImageField({
  label,
  hint,
  /** Clé de stockage déjà enregistrée, ou `null`. Jamais une URL. */
  value,
  alt,
  pickLabel,
  replaceLabel,
  removeLabel,
  errorLabel,
  emptyIcon,
  aspect = 'square',
  disabled = false,
  busy = false,
  onPick,
  onRemove,
  className,
}: {
  label: string
  hint?: string
  value: string | null
  alt: string
  pickLabel: string
  replaceLabel: string
  removeLabel: string
  /** Rendu du motif de refus. Reçoit `unsupported_type`, `too_large`, `decode_failed`. */
  errorLabel: (reason: ImagePickError) => string
  emptyIcon: React.ReactNode
  aspect?: 'square' | 'wide'
  disabled?: boolean
  busy?: boolean
  onPick: (dataUrl: string) => void
  onRemove: () => void
  className?: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<ImagePickError | null>(null)

  /**
   * L'APERÇU LOCAL, montré avant même que le serveur ait répondu.
   *
   * Sans lui, choisir une photo ne change rien à l'écran pendant la seconde que dure
   * l'envoi, et le premier réflexe est de recommencer. Il tient jusqu'à ce que la
   * clé enregistrée revienne par les propriétés — à ce moment l'image servie remplace
   * l'aperçu sans que rien ne bouge à l'œil, puisque c'est la même image.
   */
  const [preview, setPreview] = useState<string | null>(null)

  const shown = preview ?? (value === null ? null : `/api/fichiers/${value}`)

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)

    try {
      const dataUrl = await shrinkToDataUrl(file)
      setPreview(dataUrl)
      onPick(dataUrl)
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : 'decode_failed'
      setError(
        reason === 'unsupported_type' || reason === 'too_large'
          ? reason
          : 'decode_failed',
      )
      setPreview(null)
    } finally {
      /*
       * Le champ est VIDÉ après chaque choix.
       *
       * Sans cela, rechoisir le même fichier — après l'avoir recadré, par exemple —
       * ne déclenche aucun `change` : le navigateur considère que la valeur n'a pas
       * changé, et rien ne se passe sans qu'on comprenne pourquoi.
       */
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={cn('grid gap-2', className)}>
      <span className="text-xs font-medium text-foreground">{label}</span>

      <div className="flex flex-wrap items-start gap-3">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-input bg-muted',
            aspect === 'square' ? 'size-24' : 'h-20 w-36',
          )}
        >
          {shown === null ? (
            <span aria-hidden="true" className="text-muted-foreground">
              {emptyIcon}
            </span>
          ) : (
            <img src={shown} alt={alt} className="size-full object-cover" />
          )}
        </div>

        <div className="grid gap-2">
          {/*
            Le `<input type="file">` natif est masqué et piloté par un bouton : son
            dessin ne se style pas de façon fiable d'un navigateur à l'autre, et il
            afficherait « Aucun fichier sélectionné » en anglais au milieu d'un écran
            arabe. Le bouton, lui, porte la traduction et la hauteur de cible du produit.
          */}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled || busy}
            onChange={(event) => {
              void pick(event.target.files?.[0])
            }}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
            >
              {value === null && preview === null ? pickLabel : replaceLabel}
            </Button>

            {value === null ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || busy}
                onClick={() => {
                  setPreview(null)
                  onRemove()
                }}
              >
                {removeLabel}
              </Button>
            )}
          </div>

          {hint === undefined ? null : (
            <p className="text-xs text-muted-foreground">{hint}</p>
          )}

          {error === null ? null : (
            <p role="alert" className="text-xs text-destructive">
              {errorLabel(error)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
