import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  BLOCK_KINDS,
  TEMPLATE_VARIABLES,
  type BlockKind,
  type TemplateBlock,
} from '~/core/contract-template'
import { Button } from '~/ui/shadcn/button'
import { Select } from '~/ui/shadcn/field'
import { cn } from '~/ui/shadcn/utils'

/**
 * L'ÉDITEUR DE MODÈLE — une pile de blocs, et une barre d'outils qui agit sur la
 * sélection.
 *
 * **Ce n'est pas un traitement de texte, et ça se voit — délibérément.** Un champ
 * `contenteditable` donnerait l'illusion de Word et en tiendrait un dixième : le
 * collage depuis Word arriverait avec ses styles, la sélection franchirait les
 * frontières de blocs, et le rendu papier deviendrait imprévisible. Ici chaque bloc est
 * un `<textarea>` ordinaire — donc le clavier, la sélection, le correcteur
 * orthographique et le collage sont ceux du navigateur, et rien n'est réimplémenté.
 *
 * La barre d'outils fait deux choses, qui sont les deux seules qu'on demande à un
 * contrat : **mettre en gras ou en italique la sélection**, et **insérer une variable
 * au curseur**. Elle agit sur le champ ACTIF, repéré par une référence — un bouton de
 * mise en forme qui ne saurait pas sur quel champ agir n'aurait aucun sens.
 *
 * `setRangeText` fait le travail : c'est l'API native d'édition d'un champ de texte,
 * elle respecte la pile d'annulation du navigateur (Ctrl+Z fonctionne) là où une
 * réécriture complète de `value` la détruirait.
 */

/** Ce que la barre d'outils sait poser autour d'une sélection. */
const MARKS: Record<'bold' | 'italic', string> = { bold: '**', italic: '__' }

export function TemplateEditor({
  blocks,
  onChange,
  disabled = false,
}: {
  blocks: readonly TemplateBlock[]
  onChange: (blocks: TemplateBlock[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()

  /** Les champs, par indice de bloc. C'est ce qui permet à la barre de savoir où agir. */
  const fields = useRef(new Map<number, HTMLTextAreaElement>())
  const [active, setActive] = useState<number | null>(null)

  function replace(index: number, patch: Partial<TemplateBlock>) {
    onChange(blocks.map((block, i) => (i === index ? { ...block, ...patch } : block)))
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved!)
    onChange(next)
  }

  /**
   * Applique une marque à la sélection du champ actif.
   *
   * Sans sélection, on pose les deux marques et on place le curseur ENTRE elles :
   * cliquer sur « G » puis taper est le geste attendu, et laisser le curseur après la
   * marque fermante ferait écrire à côté.
   */
  function mark(kind: 'bold' | 'italic') {
    if (active === null) return
    const field = fields.current.get(active)
    if (!field) return

    const token = MARKS[kind]
    const { selectionStart, selectionEnd } = field
    const selected = field.value.slice(selectionStart, selectionEnd)

    field.focus()
    field.setRangeText(`${token}${selected}${token}`, selectionStart, selectionEnd, 'end')
    if (selected.length === 0) {
      const caret = selectionStart + token.length
      field.setSelectionRange(caret, caret)
    }

    // `setRangeText` ne déclenche pas d'événement `input` : l'état React ne bougerait
    // pas et la frappe suivante écraserait la marque qu'on vient de poser.
    replace(active, { text: field.value })
  }

  function insertVariable(name: string) {
    if (active === null || name === '') return
    const field = fields.current.get(active)
    if (!field) return

    field.focus()
    field.setRangeText(`{{${name}}}`, field.selectionStart, field.selectionEnd, 'end')
    replace(active, { text: field.value })
  }

  return (
    <div className="grid gap-4">
      {/*
        LA BARRE D'OUTILS reste en haut et ne bouge pas.

        Elle est désactivée tant qu'aucun champ n'a le focus, plutôt que masquée : une
        barre qui apparaît et disparaît fait sauter la mise en page à chaque clic, et on
        finit par ne plus savoir où elle était.
      */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || active === null}
          // `onMouseDown` et non `onClick` : le clic ferait perdre le focus au champ,
          // donc la sélection, avant que le gestionnaire ne s'exécute.
          onMouseDown={(event) => {
            event.preventDefault()
            mark('bold')
          }}
        >
          <span className="font-bold">{t('template.bold')}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || active === null}
          onMouseDown={(event) => {
            event.preventDefault()
            mark('italic')
          }}
        >
          <span className="italic">{t('template.italic')}</span>
        </Button>

        <Select
          aria-label={t('template.insertVariable')}
          value=""
          disabled={disabled || active === null}
          className="max-w-56"
          onMouseDown={(event) => {
            // Même raison : garder le focus et la position du curseur dans le champ.
            event.stopPropagation()
          }}
          onChange={(event) => {
            insertVariable(event.target.value)
            event.target.value = ''
          }}
        >
          <option value="">{t('template.insertVariable')}</option>
          {TEMPLATE_VARIABLES.map((name) => (
            <option key={name} value={name}>
              {t(`template.variable.${name}`)}
            </option>
          ))}
        </Select>

        <span className="text-2xs text-muted-foreground">
          {active === null ? t('template.pickField') : t('template.marksHint')}
        </span>
      </div>

      {blocks.map((block, index) => (
        <div
          key={index}
          className={cn(
            'grid gap-2 rounded-lg border border-border p-3',
            active === index && 'border-ring',
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={t('template.blockKind')}
              value={block.kind}
              disabled={disabled}
              className="max-w-44"
              onChange={(event) => replace(index, { kind: event.target.value as BlockKind })}
            >
              {BLOCK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`template.kind.${kind}`)}
                </option>
              ))}
            </Select>

            <span className="ms-auto flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('template.moveUp')}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                <span aria-hidden="true">↑</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('template.moveDown')}
                disabled={disabled || index === blocks.length - 1}
                onClick={() => move(index, 1)}
              >
                <span aria-hidden="true">↓</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(blocks.filter((_, i) => i !== index))}
              >
                {t('action.delete')}
              </Button>
            </span>
          </div>

          {/* Le bloc de signatures n'a pas de texte : proposer un champ vide qui ne
              s'imprime nulle part serait une invitation à écrire dans le vide. */}
          {block.kind === 'signatures' ? (
            <p className="text-xs text-muted-foreground">{t('template.signaturesHint')}</p>
          ) : (
            <textarea
              ref={(element) => {
                if (element) fields.current.set(index, element)
                else fields.current.delete(index)
              }}
              value={block.text}
              disabled={disabled}
              rows={block.kind === 'heading' ? 1 : 4}
              onFocus={() => setActive(index)}
              onChange={(event) => replace(index, { text: event.target.value })}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-control outline-none focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-ring/55"
            />
          )}

          {block.kind === 'list' ? (
            <p className="text-2xs text-muted-foreground">{t('template.listHint')}</p>
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        {BLOCK_KINDS.map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onChange([...blocks, { kind, text: '' }])}
          >
            {t('template.addKind', { kind: t(`template.kind.${kind}`) })}
          </Button>
        ))}
      </div>
    </div>
  )
}
