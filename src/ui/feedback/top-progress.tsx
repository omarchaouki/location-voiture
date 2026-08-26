import { useEffect, useRef, useState } from 'react'
import { useIsFetching } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'

const APPEAR_AFTER_MS = 150
const MIN_VISIBLE_MS = 400
const FADE_MS = 180
const TICK_MS = 120

/**
 * Barre de progression supérieure, maison (pas NProgress).
 *
 * Deux sources : la navigation du routeur ET les requêtes en vol. Deux garde-fous :
 * elle n'apparaît qu'après 150 ms (une navigation instantanée ne doit rien afficher)
 * et reste au moins 400 ms (sinon elle clignote). docs/DESIGN.md §7.
 *
 * La progression est asymptotique : elle n'atteint jamais 100 % toute seule, parce
 * qu'elle indique un travail en cours, pas une durée connue. Le remplissage final
 * est DÉRIVÉ de `busy` et non écrit dans l'état, pour ne pas déclencher de rendu
 * en cascade au moment précis où la page finit de charger.
 */
export function TopProgress() {
  const routerStatus = useRouterState({ select: (state) => state.status })
  const fetching = useIsFetching()
  const busy = routerStatus === 'pending' || fetching > 0

  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const shownAtRef = useRef<number | null>(null)

  // Apparition différée : rien ne s'affiche si le travail dure moins de 150 ms.
  useEffect(() => {
    if (!busy || visible) return undefined
    const timer = window.setTimeout(() => {
      shownAtRef.current = Date.now()
      setVisible(true)
    }, APPEAR_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [busy, visible])

  // Disparition retardée : au moins 400 ms à l'écran, puis le fondu.
  useEffect(() => {
    if (busy || !visible) return undefined
    const shownAt = shownAtRef.current ?? Date.now()
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt))
    const timer = window.setTimeout(() => {
      shownAtRef.current = null
      setVisible(false)
      setProgress(0)
    }, remaining + FADE_MS)
    return () => window.clearTimeout(timer)
  }, [busy, visible])

  // Avance asymptotique : 12 % de ce qu'il reste à chaque pas, sans jamais finir.
  useEffect(() => {
    if (!visible || !busy) return undefined
    const interval = window.setInterval(() => {
      setProgress((current) => current + (0.92 - current) * 0.12)
    }, TICK_MS)
    return () => window.clearInterval(interval)
  }, [visible, busy])

  if (!visible) return null

  // Dérivé, jamais stocké : dès que le travail est fini, la barre se remplit.
  const displayed = busy ? Math.max(progress, 0.08) : 1

  return (
    <div className="pointer-events-none fixed top-0 start-0 end-0 z-50 h-[2px]" aria-hidden="true">
      <div
        className="origin-inline-start h-full bg-stamp transition-[transform,opacity] duration-150 ease-out"
        style={{ transform: `scaleX(${displayed})`, opacity: busy ? 1 : 0 }}
      />
    </div>
  )
}
