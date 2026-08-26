import 'maplibre-gl/dist/maplibre-gl.css'
import * as maplibregl from 'maplibre-gl'
const { getRTLTextPluginStatus, setRTLTextPlugin, Map: MlMap } = maplibregl

const params = new URLSearchParams(location.search)
const version = params.get('v') ?? '0.3.0'
const withPlugin = params.get('plugin') !== 'off'
const url = `/plugins/rtl-${version}.js`
const font = params.get('font') ?? 'Open Sans Regular'
const log = []
const out = document.getElementById('out')
const push = (line) => { log.push(line); out.textContent = log.join('\n') }

document.getElementById('head').textContent =
  `maplibre ${maplibregl.getVersion()} × rtl-text ${withPlugin ? version : 'AUCUN (témoin)'}`

const state = { version, withPlugin, log, done: false, ok: null, mapErrors: [], requests: [] }
window.__probe = state

window.addEventListener('error', (e) => push(`window error: ${e.message}`))
window.addEventListener('unhandledrejection', (e) => push(`unhandled: ${e.reason}`))

let loadError = null
let pluginPromise = Promise.resolve()
if (withPlugin) {
  push(`status avant: ${getRTLTextPluginStatus()}`)
  // Pas d'`await` avant la carte : la promesse ne se résout qu'une fois un worker vivant.
  pluginPromise = setRTLTextPlugin(url, false).catch((error) => {
    loadError = String(error)
    push(`setRTLTextPlugin: REJETÉ — ${loadError}`)
  })
  push(`status juste après l'appel: ${getRTLTextPluginStatus()}`)
}

const map = new MlMap({
  container: 'map',
  preserveDrawingBuffer: true,
  // Les glyphes sont demandés PAR LE WORKER mais résolus par le fil principal :
  // on les intercepte ici, et les plages demandées disent si le texte a été mis en forme.
  transformRequest: (requestUrl, resourceType) => {
    state.requests.push(`${resourceType}:${requestUrl}`)
    return { url: requestUrl }
  },
  style: {
    version: 8,
    glyphs: params.get('glyphs') ?? 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      pts: {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-7.62, 33.59] },
              properties: { ar: 'شارع محمد الخامس', mixed: 'الدار البيضاء 12345' } },
          ],
        },
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#ffffff' } },
      { id: 'ar', type: 'symbol', source: 'pts',
        layout: { 'text-field': ['get', 'ar'], 'text-font': [font], 'text-size': 24, 'text-offset': [0, -1.4] },
        paint: { 'text-color': '#000000' } },
      { id: 'mixed', type: 'symbol', source: 'pts',
        layout: { 'text-field': ['get', 'mixed'], 'text-font': [font], 'text-size': 24, 'text-offset': [0, 1.4] },
        paint: { 'text-color': '#000000' } },
    ],
  },
  center: [-7.62, 33.59],
  zoom: 12,
  attributionControl: false,
})
window.__map = map
map.on('error', (e) => { const m = e.error?.message ?? String(e.error); state.mapErrors.push(m); push(`map error: ${m}`) })

await pluginPromise
state.status = getRTLTextPluginStatus()
push(`status après attente: ${state.status}`)

if (withPlugin) {
  const worker = new Worker('/probe-worker.mjs', { type: 'module' })
  state.shaping = await new Promise((resolve) => {
    worker.onmessage = (e) => resolve(e.data)
    worker.onerror = (e) => resolve({ error: `worker: ${e.message}` })
    worker.postMessage({ url })
  })
  push(`shaping: ${JSON.stringify(state.shaping)}`)
}

await new Promise((resolve) => {
  if (map.loaded()) return resolve()
  map.on('idle', resolve)
  setTimeout(resolve, 8000)
})

// Encre réellement peinte : combien de pixels non blancs sur le canevas ?
const canvas = map.getCanvas()
const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
const pixels = new Uint8Array(canvas.width * canvas.height * 4)
gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
let inked = 0
for (let i = 0; i < pixels.length; i += 4) {
  if (pixels[i] < 200 || pixels[i + 1] < 200 || pixels[i + 2] < 200) inked++
}
state.inkedPixels = inked
state.glyphRanges = state.requests.filter((r) => r.startsWith('Glyphs')).map((r) => r.split('/').slice(-1)[0])
push(`pixels encrés: ${inked}`)
push(`plages de glyphes: ${JSON.stringify(state.glyphRanges)}`)

state.ok = loadError === null && (!withPlugin || (state.status === 'loaded' && !state.shaping?.error))
state.done = true
