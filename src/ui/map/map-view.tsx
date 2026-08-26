// i18n-exempt — ce composant ne produit aucun texte : il reçoit des libellés déjà
// traduits et les pose sur la carte. Les seules chaînes littérales sont des noms de
// couches MapLibre et des identifiants CSS.

import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
// Import de TYPE uniquement : il disparaît à la compilation, donc rien n'est chargé
// au rendu serveur. Le paquet lui-même est importé dynamiquement, après le montage.
import type {
  AddLayerObject,
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from 'maplibre-gl'

// Le suffixe `?url` est une convention Vite : il rend l'actif STATIQUE pour
// l'empaqueteur et renvoie son adresse finale. Voir l'explication dans l'effet.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

import { circleToRing, type Bounds, type LatLng } from '~/core/geo'
import { ensureRtlTextPlugin } from './rtl-text'
import { blankStyle, readMapPalette } from './style'

/**
 * LA carte.
 *
 * Trois précautions que la pile impose, et qui ne se devinent pas :
 *
 *  1. **MapLibre n'existe pas au rendu serveur.** Le paquet touche `window` dès son
 *     évaluation : il est donc importé dynamiquement, après le montage.
 *  2. **Le greffon RTL doit être chargé avant l'arabe**, sinon les étiquettes du fond
 *     de carte sortent en lettres isolées et à l'envers (docs/DECISIONS.md §12.1).
 *  3. **`optimizeDeps.exclude: ['maplibre-gl']`** dans `vite.config.ts`, faute de quoi
 *     le worker part en 404 et la carte reste muette sans lever la moindre erreur (§12.2).
 *
 * Les repères sont des éléments DOM ordinaires, pas des symboles de la carte : le
 * navigateur sait afficher l'arabe et isoler une plaque en bidi, la couche GL non.
 */

export interface MapMarker {
  id: string
  lat: number
  lng: number
  /** Déjà traduit et formaté par l'appelant. */
  label: string
  /** Rôle de sévérité — le jeton, pas la couleur. */
  tone: 'ink' | 'stamp' | 'danger' | 'muted'
}

export interface MapShape {
  id: string
  kind: 'circle' | 'polygon'
  center?: LatLng
  radiusM?: number
  ring?: ReadonlyArray<LatLng>
}

export interface MapViewProps {
  /** Style du fond. `null` = plan vierge, aucune requête vers un tiers. */
  styleUrl: string | null
  markers: ReadonlyArray<MapMarker>
  shapes?: ReadonlyArray<MapShape>
  track?: ReadonlyArray<LatLng>
  bounds?: Bounds | undefined
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Clic sur le fond de carte. Sert à placer le centre d'une zone. */
  onMapClick?: (point: LatLng) => void
  /** Étiquette de la région pour les lecteurs d'écran, traduite par l'appelant. */
  label: string
  height?: string
}

const TONE_VARIABLES: Record<MapMarker['tone'], string> = {
  ink: 'var(--ink)',
  stamp: 'var(--stamp)',
  danger: 'var(--danger)',
  muted: 'var(--muted)',
}

export function MapView({
  styleUrl,
  markers,
  shapes = [],
  track = [],
  bounds,
  selectedId = null,
  onSelect,
  onMapClick,
  label,
  height = 'min(70vh, 32rem)',
}: MapViewProps) {
  const container = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRefs = useRef<MapLibreMarker[]>([])
  /*
   * DEUX signaux, et les confondre vide la carte.
   *
   * La carte se construit après le montage (import dynamique, puis événement
   * `load`). Les effets qui posent les repères et les zones s'exécutent AVANT :
   * sans état de rendu pour les réveiller, ils voient `null` et ne repassent jamais.
   * Un `ref` ne suffit donc pas — bug constaté à l'écran, pas en relisant.
   *
   * Mais les deux signaux n'arrivent pas au même moment, et n'ouvrent pas la même
   * chose :
   *  - `created` : l'objet carte existe. Il suffit pour poser des repères, qui sont
   *    des éléments DOM ancrés à des coordonnées.
   *  - `styleReady` : le style est chargé. Il est EXIGÉ pour `addSource`/`addLayer`,
   *    donc pour les zones et les traces.
   * Attendre `styleReady` pour les repères les ferait disparaître dans tout contexte
   * où la première image tarde — un onglet en arrière-plan n'appelle jamais
   * `requestAnimationFrame`, donc n'émet jamais `load`.
   */
  const [created, setCreated] = useState(false)
  const [styleReady, setStyleReady] = useState(false)
  /* Les formes et la trace au moment où la carte finit de charger. Une `ref` et non
     une dépendance : sinon un changement de zone reconstruirait la carte entière.
     Elle est mise à jour dans un effet, jamais pendant le rendu. */
  const overlaysRef = useRef<{ shapes: ReadonlyArray<MapShape>; track: ReadonlyArray<LatLng> }>({
    shapes,
    track,
  })

  // Le rendu ne dépend que de ces valeurs : on les compare par leur forme sérialisée
  // plutôt que par référence, sinon chaque rendu de la page redessinerait la carte.
  const markerKey = JSON.stringify(markers)
  const shapeKey = JSON.stringify(shapes)
  const trackKey = JSON.stringify(track)

  useEffect(() => {
    overlaysRef.current = { shapes, track }
  }, [shapes, track])

  useEffect(() => {
    let cancelled = false
    const node = container.current
    if (!node) return

    void (async () => {
      await ensureRtlTextPlugin()
      const maplibre = await import('maplibre-gl')
      if (cancelled || !container.current) return

      /*
       * LE WORKER, DÉSIGNÉ EXPLICITEMENT.
       *
       * MapLibre 6 le charge par `new URL('./maplibre-gl-worker.mjs', import.meta.url)`,
       * avec un nom de fichier CALCULÉ (dev ou prod). Aucun empaqueteur ne sait voir
       * cette référence : Vite ne l'émet donc pas dans `dist/`, et la carte se tait
       * en production exactement comme elle se taisait en développement — sans lever
       * la moindre erreur. Constaté sur la sortie de `pnpm build` : aucun fichier
       * `*worker*` n'était produit.
       *
       * L'import `?url` rend la référence STATIQUE : Vite émet l'actif et nous rend
       * son adresse finale, en développement comme après empaquetage. docs/DECISIONS.md §12.2.
       */
      maplibre.config.WORKER_URL = workerUrl

      const map = new maplibre.Map({
        container: node,
        style: (styleUrl ?? blankStyle(readMapPalette())) as never,
        center: [-7.6167, 33.5945],
        zoom: 10,
        // L'attribution des données reste affichée : c'est une obligation des
        // fournisseurs de tuiles, pas une décoration qu'on retire pour faire propre.
        attributionControl: { compact: true },
      })

      mapRef.current = map
      setCreated(true)
      map.on('load', () => {
        drawShapes(map, overlaysRef.current.shapes)
        drawTrack(map, overlaysRef.current.track)
        setStyleReady(true)
      })
    })()

    return () => {
      cancelled = true
      setCreated(false)
      setStyleReady(false)
      mapRef.current?.remove()
      mapRef.current = null
    }
    // Le style est la seule chose qui impose de reconstruire la carte.
  }, [styleUrl])

  /* Repères : on les redessine en entier à chaque changement. Une flotte tient en
     quelques dizaines de voitures ; un diff incrémental coûterait plus de code qu'il
     n'économiserait d'images. */
  useEffect(() => {
    if (!created || !mapRef.current) return

    for (const marker of markerRefs.current) marker.remove()
    markerRefs.current = []

    void (async () => {
      const maplibre = await import('maplibre-gl')
      const current = mapRef.current
      if (!current) return

      for (const marker of markers) {
        const element = markerElement(marker, marker.id === selectedId)
        if (onSelect) {
          element.addEventListener('click', () => onSelect(marker.id))
        }
        markerRefs.current.push(
          new maplibre.Marker({ element }).setLngLat([marker.lng, marker.lat]).addTo(current),
        )
      }
    })()
  }, [created, markerKey, selectedId, onSelect, markers])

  useEffect(() => {
    const map = mapRef.current
    if (!styleReady || !map) return
    drawShapes(map, shapes)
    drawTrack(map, track)
  }, [styleReady, shapeKey, trackKey, shapes, track])

  /* Clic sur le fond. La fonction est gardée dans une `ref` : la rebrancher à chaque
     rendu réabonnerait l'écouteur, et un parent qui recrée sa fonction à chaque frappe
     ferait perdre le clic. */
  const clickRef = useRef(onMapClick)
  useEffect(() => {
    clickRef.current = onMapClick
  }, [onMapClick])

  useEffect(() => {
    const map = mapRef.current
    if (!created || !map) return

    const handler = (event: { lngLat: { lat: number; lng: number } }) => {
      clickRef.current?.({ lat: event.lngLat.lat, lng: event.lngLat.lng })
    }
    map.on('click', handler)
    return () => {
      map.off('click', handler)
    }
  }, [created])

  /* Cadrage : on suit les données. Un déplacement animé est agréable, mais
     `prefers-reduced-motion` demande explicitement qu'on ne fasse pas voyager
     l'écran — on saute alors directement au bon endroit. */
  useEffect(() => {
    const map = mapRef.current
    if (!created || !map || !bounds) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: 48, maxZoom: 15, duration: reduced ? 0 : 600 },
    )
  }, [created, bounds])

  return (
    <div
      ref={container}
      role="region"
      aria-label={label}
      className="border border-rule bg-surface-sunken"
      style={{ height }}
    />
  )
}

/* -------------------------------------------------------------------------- */

/**
 * Un repère : un cadre, un filet, une plaque. Aucune ombre — la direction est aux
 * filets, y compris sur la carte (docs/DESIGN.md §2).
 */
function markerElement(marker: MapMarker, selected: boolean): HTMLElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'numeric'
  element.setAttribute('aria-label', marker.label)
  element.style.cssText = [
    'display:flex',
    'align-items:center',
    'gap:0.25rem',
    'padding:0.35rem 0.5rem',
    'font-size:0.6875rem',
    'line-height:1',
    'border-radius:2px',
    'cursor:pointer',
    'background:var(--surface)',
    `color:${TONE_VARIABLES[marker.tone]}`,
    `border:${selected ? '2px' : '1px'} solid ${selected ? 'var(--stamp)' : 'var(--rule-strong)'}`,
    /*
     * 32 px, et non les 44 px de la charte tactile.
     *
     * Un repère de 44 px de haut sur une carte de flotte masque la voiture d'à côté :
     * à Casablanca, dix véhicules tiennent dans un carré de 300 m. Le compromis est
     * assumé PARCE QUE le repère n'est pas le seul chemin — la liste sous la carte
     * offre la même sélection à pleine hauteur de ligne. Consigné dans docs/AUDIT.md.
     */
    'min-height:32px',
  ].join(';')

  const dot = document.createElement('span')
  dot.style.cssText = [
    'width:6px',
    'height:6px',
    'border-radius:50%',
    `background:${TONE_VARIABLES[marker.tone]}`,
  ].join(';')

  const text = document.createElement('bdi')
  text.dir = 'ltr'
  text.textContent = marker.label

  element.append(dot, text)
  return element
}

/** Zones : un remplissage très léger et un filet. Le cercle devient un anneau ici. */
function drawShapes(map: MapLibreMap, shapes: ReadonlyArray<MapShape>): void {
  const features = shapes
    .map((shape) => {
      const ring =
        shape.kind === 'circle' && shape.center && typeof shape.radiusM === 'number'
          ? circleToRing(shape.center, shape.radiusM)
          : (shape.ring ?? [])
      if (ring.length < 3) return null

      const coordinates = [...ring, ring[0]!].map((point) => [point.lng, point.lat])
      return {
        type: 'Feature' as const,
        properties: { id: shape.id },
        geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
      }
    })
    .filter((feature) => feature !== null)

  upsert(map, 'geofences', { type: 'FeatureCollection', features }, [
    {
      id: 'geofences-fill',
      type: 'fill',
      source: 'geofences',
      paint: { 'fill-color': 'var-stamp', 'fill-opacity': 0.06 },
    },
    {
      id: 'geofences-line',
      type: 'line',
      source: 'geofences',
      paint: { 'line-color': 'var-stamp', 'line-width': 1.5, 'line-dasharray': [3, 2] },
    },
  ])
}

function drawTrack(map: MapLibreMap, track: ReadonlyArray<LatLng>): void {
  const features =
    track.length >= 2
      ? [
          {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'LineString' as const,
              coordinates: track.map((point) => [point.lng, point.lat]),
            },
          },
        ]
      : []

  upsert(map, 'track', { type: 'FeatureCollection', features }, [
    {
      id: 'track-line',
      type: 'line',
      source: 'track',
      paint: { 'line-color': 'var-ink', 'line-width': 2 },
    },
  ])
}

/**
 * Pose une source et ses couches, ou met simplement à jour la donnée si elles
 * existent déjà. Recréer les couches à chaque changement ferait clignoter la carte.
 *
 * Les couleurs sont résolues ICI : un style MapLibre n'accepte pas `var(--stamp)`,
 * il veut une couleur calculée. On la lit sur les jetons, on ne l'écrit pas.
 */
function upsert(
  map: MapLibreMap,
  sourceId: string,
  data: unknown,
  layers: ReadonlyArray<Record<string, unknown>>,
): void {
  const existing = map.getSource(sourceId)
  if (existing) {
    // `setData` est asynchrone depuis MapLibre 6 : on ne l'attend pas, mais on le dit.
    void (existing as GeoJSONSource).setData(data)
    return
  }

  const palette = readMapPalette()
  const resolve = (value: unknown): unknown =>
    value === 'var-stamp'
      ? getComputedStyle(document.documentElement).getPropertyValue('--stamp').trim()
      : value === 'var-ink'
        ? palette.ink
        : value

  map.addSource(sourceId, { type: 'geojson', data } as never)
  for (const layer of layers) {
    const paint = Object.fromEntries(
      Object.entries(layer['paint'] as Record<string, unknown>).map(([key, value]) => [
        key,
        resolve(value),
      ]),
    )
    map.addLayer({ ...layer, paint } as unknown as AddLayerObject)
  }
}
