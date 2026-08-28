import { Printer } from 'lucide-react'

import { Button } from '~/ui/shadcn/button'

/**
 * IMPRESSION.
 *
 * Un loueur imprime, et il imprime beaucoup : le contrat qu'on fait signer au
 * comptoir, l'attestation d'assurance qui reste dans la boîte à gants, la fiche d'un
 * véhicule qu'on donne au mécanicien. Le produit n'offrait aucun de ces gestes.
 *
 * **Pas de génération de PDF, et c'est un choix.** Une bibliothèque de PDF côté
 * client, c'est deux à trois cents kilo-octets dans un produit qui mesure son paquet à
 * chaque construction, et une seconde mise en page à entretenir en parallèle de
 * l'écran — qui divergera. La feuille de style d'impression, elle, décrit la MÊME
 * page : ce qui est corrigé à l'écran l'est aussi sur le papier. Et « Imprimer » du
 * navigateur sait déjà enregistrer en PDF, sur toutes les plateformes.
 *
 * Les règles de mise en page vivent dans `src/styles/app.css` (`@media print`), et la
 * palette d'impression dans `tokens.css` : on n'imprime jamais un fond sombre.
 */
export function PrintButton({ label }: { label: string }) {
  return (
    // Le bouton ne doit pas figurer sur la feuille qu'il produit.
    <Button type="button" variant="outline" data-print="hide" onClick={() => window.print()}>
      <Printer aria-hidden="true" />
      <span>{label}</span>
    </Button>
  )
}

/**
 * L'en-tête qui n'existe QUE sur le papier.
 *
 * Une feuille imprimée quitte l'application : plus de barre latérale, plus de nom
 * d'agence, plus rien qui dise d'où elle vient. Elle circule pourtant — au comptoir,
 * chez l'assureur, au garage. Elle porte donc son émetteur, son objet et sa date, et
 * ces trois lignes n'apparaissent jamais à l'écran.
 */
export function PrintHeader({
  organization,
  title,
  reference,
  printedOn,
}: {
  organization: string
  title: string
  reference?: string
  /** Déjà formatée par `src/i18n/format.ts` — jamais un `Intl` d'ici. */
  printedOn: string
}) {
  return (
    <div data-print="only" className="mb-6 hidden border-b border-border pb-3">
      <p className="text-base font-semibold">{organization}</p>
      <p className="mt-1 text-sm">{title}</p>
      <p className="numeric mt-0.5 text-xs text-muted-foreground">
        {reference ? `${reference} · ` : ''}
        {printedOn}
      </p>
    </div>
  )
}
