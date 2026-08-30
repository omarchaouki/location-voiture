// i18n-exempt — ce composant ne produit aucun texte : tout ce qu'il affiche vient du
// modèle écrit par l'agence, et les deux libellés de signature lui sont passés traduits.

import {
  fillVariables,
  linesOf,
  parseRuns,
  type TemplateBlock,
  type VariableValues,
} from '~/core/contract-template'
import { cn } from '~/ui/shadcn/utils'

/**
 * LE RENDU DU MODÈLE — le même à l'aperçu et sur le papier.
 *
 * Un seul composant pour les deux, et c'est le point : deux rendus finiraient par
 * différer, et l'écart se découvrirait sur un contrat déjà signé.
 *
 * **Rien n'est injecté en HTML.** Chaque fragment devient un `<strong>`, un `<em>` ou
 * du texte nu — jamais `dangerouslySetInnerHTML`. C'est ce qui rend l'éditeur
 * inoffensif quoi que l'agence tape dans ses clauses, et c'est la raison pour laquelle
 * le modèle est stocké en blocs plutôt qu'en HTML.
 */

function Runs({ text }: { text: string }) {
  return (
    <>
      {parseRuns(text).map((run, index) => {
        // La clé est l'indice : ces fragments n'ont pas d'identité propre et la liste
        // est intégralement recalculée à chaque frappe.
        if (run.bold) return <strong key={index}>{run.text}</strong>
        if (run.italic) return <em key={index}>{run.text}</em>
        return <span key={index}>{run.text}</span>
      })}
    </>
  )
}

export function TemplateRender({
  blocks,
  values,
  signatureLabels,
  className,
}: {
  blocks: readonly TemplateBlock[]
  /** Valeurs des variables. Vide à l'aperçu : les points de conduite s'affichent. */
  values: VariableValues
  /** Déjà traduits : [côté loueur, côté locataire]. */
  signatureLabels: readonly [string, string]
  className?: string
}) {
  return (
    <div className={cn('grid gap-3 text-sm leading-relaxed', className)}>
      {blocks.map((block, index) => {
        const text = fillVariables(block.text, values)

        if (block.kind === 'heading') {
          return (
            <h3 key={index} className="mt-2 text-base font-semibold">
              <Runs text={text} />
            </h3>
          )
        }

        if (block.kind === 'list') {
          return (
            /* Retrait logique (`ps-`) et non physique : la puce se met du bon côté en
               arabe sans une ligne de plus. Aucune propriété physique dans ce projet. */
            <ul key={index} className="grid list-disc gap-1 ps-5">
              {linesOf({ ...block, text }).map((line, lineIndex) => (
                <li key={lineIndex}>
                  <Runs text={line} />
                </li>
              ))}
            </ul>
          )
        }

        if (block.kind === 'signatures') {
          return (
            /*
              LES CADRES À SIGNER.

              `break-inside-avoid` empêche l'imprimante de couper un cadre en deux entre
              deux pages — une signature à cheval sur une pliure ne vaut rien.
            */
            <div
              key={index}
              className="mt-6 grid gap-6 break-inside-avoid sm:grid-cols-2"
            >
              {signatureLabels.map((label) => (
                <div key={label} className="grid gap-1">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="h-20 rounded-md border border-border" />
                </div>
              ))}
            </div>
          )
        }

        return (
          <p key={index}>
            <Runs text={text} />
          </p>
        )
      })}
    </div>
  )
}
