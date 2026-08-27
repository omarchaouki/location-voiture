import type { ReactNode } from 'react'

/**
 * TABLEAU DE DONNÉES — la brique qui manquait le plus.
 *
 * Les listes du produit étaient des `<ul>` de rangées `flex`. Ça se dessine vite et
 * ça ment sur trois points :
 *
 *  - **il n'y a pas d'en-tête**, donc rien ne nomme les colonnes. L'utilisateur
 *    devine ce que veut dire « 12 » à la troisième position ;
 *  - **les colonnes ne s'alignent pas** d'une ligne à l'autre : chaque rangée
 *    répartit son espace toute seule, et l'œil ne peut plus balayer verticalement ;
 *  - **un lecteur d'écran n'annonce rien** : pas de `<th>`, pas de relation
 *    cellule/colonne. C'est la différence entre « Atlas Cars, pro, actif, 3 » et
 *    « Agence : Atlas Cars, Offre : pro, État : actif, Membres : 3 ».
 *
 * **Le tableau disparaît sous 768 px.** Il n'est pas rendu défilable
 * horizontalement : sur téléphone, chaque ligne devient une fiche empilée, avec le
 * libellé de colonne à côté de la valeur. Un tableau de six colonnes qui glisse de
 * côté sur 375 px est illisible, et le défilement horizontal imbriqué se bat avec le
 * défilement de la page.
 */

export interface Column<TRow> {
  /** Clé stable. Sert aussi de clé React. */
  key: string
  /** Intitulé, déjà traduit. */
  header: string
  /** Rendu de la cellule. */
  cell: (row: TRow) => ReactNode
  /** Colonne de chiffres : alignée en fin de ligne, jamais au début. */
  numeric?: boolean
  /**
   * Colonne cachée sur les écrans étroits (en fiche empilée aussi). Réservée à ce
   * qui est vraiment secondaire — une colonne masquée est une colonne perdue.
   */
  secondary?: boolean
  /** Largeur fixe, pour empêcher une colonne d'action de s'étirer. */
  width?: string
}

export function DataTable<TRow>({
  columns,
  rows,
  rowKey,
  caption,
  /** Rendu additionnel sous la ligne (message d'erreur, détail). */
  rowDetail,
}: {
  columns: ReadonlyArray<Column<TRow>>
  rows: readonly TRow[]
  rowKey: (row: TRow) => string
  /** Résumé du tableau pour les lecteurs d'écran. Jamais affiché. */
  caption: string
  rowDetail?: (row: TRow) => ReactNode
}) {
  return (
    <>
      {/* ---- Écrans larges : un vrai tableau ---- */}
      <table className="hidden w-full border-collapse text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-muted">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={`px-4 py-2 text-xs font-medium text-muted-foreground ${
                  column.numeric ? 'text-end' : 'text-start'
                } ${column.secondary ? 'hidden lg:table-cell' : ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const detail = rowDetail?.(row)
            return (
              <tr
                key={rowKey(row)}
                className="border-b border-border transition-colors last:border-b-0 hover:bg-muted"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-2.5 align-middle ${
                      column.numeric ? 'numeric text-end' : 'text-start'
                    } ${column.secondary ? 'hidden lg:table-cell' : ''}`}
                  >
                    {column.cell(row)}
                    {/*
                      Le détail vit dans la PREMIÈRE cellule, pas dans une seconde
                      rangée : une rangée supplémentaire décalerait les colonnes de
                      tout ce qui suit dans le tableau.
                    */}
                    {column.key === columns[0]?.key && detail ? (
                      <div className="mt-1">{detail}</div>
                    ) : null}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* ---- Téléphone : une fiche par ligne, libellés inclus ---- */}
      <ul className="md:hidden">
        {rows.map((row) => {
          const detail = rowDetail?.(row)
          return (
            <li
              key={rowKey(row)}
              className="border-b border-border px-4 py-3 last:border-b-0"
            >
              <dl className="grid gap-1">
                {columns.map((column, index) => (
                  <div
                    key={column.key}
                    className={
                      index === 0
                        ? ''
                        : 'flex items-baseline justify-between gap-3 text-xs'
                    }
                  >
                    {index === 0 ? null : (
                      <dt className="shrink-0 text-muted-foreground">{column.header}</dt>
                    )}
                    <dd className={index === 0 ? 'font-medium' : 'text-end'}>
                      {column.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
              {detail ? <div className="mt-2">{detail}</div> : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}
