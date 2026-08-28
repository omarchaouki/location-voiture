import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { markNotificationsRead, pollNotifications, type NotificationFeed } from '~/server/alerts'

/**
 * LE SONDAGE DES NOTIFICATIONS — une seule fois par onglet.
 *
 * Le hook vit dans la coquille (`$lang/app.tsx`), et il alimente DEUX consommateurs :
 * la pastille rouge posée sur la rubrique « Alertes » de la navigation, et la page des
 * alertes elle-même, qui la reçoit par contexte (`notifications-context.tsx`).
 *
 * Il est appelé à UN SEUL endroit, et c'est ce qui compte : la navigation est rendue
 * deux fois — barre latérale au-dessus de 1024 px, bande défilante en dessous — et
 * deux instances du hook, ce serait deux requêtes par minute et surtout DEUX sons pour
 * une seule échéance.
 *
 * Trois comportements que tout sondage sérieux doit avoir, et qu'on oublie tous :
 *
 *  1. **Un onglet caché ne sonde pas.** Douze onglets ouverts la journée sur le même
 *     poste, c'est douze requêtes par minute pour personne. `visibilitychange` remet
 *     en marche, et sonde IMMÉDIATEMENT au retour — le premier regard doit être à jour.
 *  2. **Pas de sondage qui se chevauche.** Une requête lente ne doit pas voir la
 *     suivante partir par-dessus, sinon la réponse la plus ancienne peut arriver en
 *     dernier et faire remonter un compteur déjà descendu.
 *  3. **Le démontage annule.** Sans cela, `setState` après une navigation lève un
 *     avertissement React et, plus grave, la sonnerie part sur un écran qu'on a quitté.
 */

/** Une minute. C'est le rythme demandé, et le recalcul serveur est amorti dessus. */
const POLL_MS = 60_000

/* ------------------------------------------------------ préférence de son */

/**
 * Le réglage du son, en magasin externe plutôt qu'en état React.
 *
 * `localStorage` n'existe pas au rendu serveur : le lire dans un `useState` initial
 * fait tomber le rendu, et le lire dans un effet provoque un second rendu en cascade
 * — ce que `react-hooks/set-state-in-effect` refuse, à juste titre.
 * `useSyncExternalStore` est l'outil prévu pour exactement ce cas : une valeur qui
 * vit HORS de React, avec une réponse distincte pour le serveur.
 *
 * C'est le même motif que `src/ui/forms/use-hydrated.ts`.
 */
const SOUND_KEY = 'flotta.notifications.sound'

const soundListeners = new Set<() => void>()
let soundCache: boolean | null = null

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    // Navigation privée, cookies bloqués : le son reste actif, c'est le défaut.
    return true
  }
}

function subscribeSound(listener: () => void): () => void {
  soundListeners.add(listener)
  return () => {
    soundListeners.delete(listener)
  }
}

/** Mémoïsé : `useSyncExternalStore` exige une valeur stable entre deux notifications. */
function soundSnapshot(): boolean {
  soundCache ??= readSoundPreference()
  return soundCache
}

/** Au rendu serveur, le son est réputé actif : c'est le défaut du produit. */
function soundServerSnapshot(): boolean {
  return true
}

function writeSoundPreference(next: boolean): void {
  soundCache = next
  try {
    window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
  } catch {
    // Préférence non conservée : le réglage vaut pour cette session, et c'est tout.
  }
  for (const listener of soundListeners) listener()
}

/* ------------------------------------------------------------------- son */

/**
 * Le son, synthétisé plutôt que chargé.
 *
 * Deux notes brèves, une quinte au-dessus : c'est reconnaissable sans être une
 * sonnerie. Aucun fichier n'est téléchargé — pas d'octet de plus dans le paquet, pas
 * de requête, et rien à héberger.
 *
 * **Il ne sonnera pas avant la première interaction de la page**, et c'est le
 * navigateur qui le décide, pas nous : toute politique d'autoplay bloque un
 * `AudioContext` créé sans geste utilisateur. On tente `resume()` et on abandonne en
 * silence — un son est un bonus, jamais le porteur de l'information. La pastille
 * rouge, elle, ne dépend de rien.
 */
let audio: AudioContext | null = null

function chime(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return

    audio ??= new Ctor()
    if (audio.state === 'suspended') void audio.resume()

    const start = audio.currentTime
    for (const [index, frequency] of [880, 1318.5].entries()) {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency

      const at = start + index * 0.11
      // Enveloppe : une onde coupée net produit un « clic » désagréable.
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)

      oscillator.connect(gain).connect(audio.destination)
      oscillator.start(at)
      oscillator.stop(at + 0.18)
    }
  } catch {
    // Un son impossible ne doit jamais casser un écran.
  }
}

/* ------------------------------------------------------------------ hook */

export interface NotificationsState {
  feed: NotificationFeed | null
  busy: boolean
  soundOn: boolean
  toggleSound: () => void
  refresh: () => void
  /**
   * Sans identifiants : tout ce qui est actif. C'est le « tout marquer comme lu ».
   *
   * Rend une PROMESSE, et l'appelant a de bonnes raisons de l'attendre : la page des
   * alertes recharge sa liste juste après, et recharger avant que l'écriture soit
   * faite ramènerait exactement l'état d'avant.
   */
  markRead: (ids?: readonly string[]) => Promise<void>
}

export function useNotifications(enabled: boolean): NotificationsState {
  const [feed, setFeed] = useState<NotificationFeed | null>(null)
  const [busy, setBusy] = useState(false)
  const soundOn = useSyncExternalStore(subscribeSound, soundSnapshot, soundServerSnapshot)

  /** Les non-lues déjà connues. Ce qui n'y figure pas et arrive est NOUVEAU. */
  const known = useRef<Set<string> | null>(null)
  const inFlight = useRef(false)
  const aliveRef = useRef(true)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const next = await pollNotifications()
      if (!aliveRef.current) return

      const unreadIds = new Set(next.items.filter((item) => !item.read).map((item) => item.id))

      /*
       * Le PREMIER chargement ne sonne jamais.
       *
       * Sinon toute ouverture d'onglet déclencherait la sonnerie sur des échéances
       * vieilles de trois jours — et une sonnerie qui se déclenche sans nouveauté
       * apprend à couper le son, ce qui coûte la vraie notification suivante.
       */
      const first = known.current === null
      if (!first && soundSnapshot()) {
        const fresh = [...unreadIds].some((id) => !known.current?.has(id))
        if (fresh) chime()
      }
      known.current = unreadIds
      setFeed(next)
    } catch {
      // Un sondage en échec (réseau coupé, session expirée) laisse l'écran tel quel :
      // vider le compteur sur une erreur ferait croire qu'il n'y a plus rien à traiter.
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    aliveRef.current = true

    /*
     * Le premier sondage est PLANIFIÉ, pas appelé dans le corps de l'effet.
     *
     * Deux raisons, et la première suffirait : un effet ne doit pas déclencher de
     * mise à jour d'état en cascade dès le montage (`react-hooks/set-state-in-effect`),
     * et le premier rendu de l'application n'a rien à gagner à attendre une requête
     * réseau. La cloche s'affiche vide, puis se remplit.
     */
    const kickoff = window.setTimeout(() => void load(), 0)
    const timer = window.setInterval(() => {
      if (!document.hidden) void load()
    }, POLL_MS)

    const onVisibility = () => {
      if (!document.hidden) void load()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      aliveRef.current = false
      window.clearTimeout(kickoff)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, load])

  const markRead = useCallback(
    async (ids?: readonly string[]) => {
      setBusy(true)
      try {
        await markNotificationsRead({ data: ids ? { ids: [...ids] } : {} })
        await load()
      } finally {
        if (aliveRef.current) setBusy(false)
      }
    },
    [load],
  )

  const toggleSound = useCallback(() => {
    const next = !soundSnapshot()
    writeSoundPreference(next)
    // Rallumer le son le FAIT ENTENDRE. Un réglage muet à l'essai ne se vérifie pas,
    // et ce clic est aussi le geste utilisateur qui débloque l'audio du navigateur.
    if (next) chime()
  }, [])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  return { feed, busy, soundOn, toggleSound, refresh, markRead }
}
