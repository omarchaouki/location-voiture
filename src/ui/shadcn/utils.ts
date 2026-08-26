import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * `cn()` — la fusion de classes attendue par shadcn/ui.
 *
 * Elle existe pour une raison précise : chaque composant de cette couche expose une
 * prop `className`, et sans fusion consciente des conflits Tailwind, un
 * `className="bg-surface"` posé par un écran perdrait contre le `bg-paper` interne du
 * composant selon l'ordre de la feuille de style. `twMerge` tranche par la dernière
 * classe déclarée, ce qui est le seul comportement prévisible.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
