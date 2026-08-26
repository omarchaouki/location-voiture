import * as maplibregl from 'maplibre-gl'
const { setRTLTextPlugin, getRTLTextPluginStatus } = maplibregl
const params = new URLSearchParams(location.search)
const version = params.get('v') ?? '0.4.0'
const out = document.getElementById('out')
const state = { resolved: false, status: getRTLTextPluginStatus(), elapsed: null }
window.__nomap = state
const started = performance.now()
// AUCUNE carte n'est créée ici : on veut savoir si la promesse se résout quand même.
setRTLTextPlugin(`/plugins/rtl-${version}.js`, false)
  .then(() => { state.resolved = true })
  .catch((e) => { state.error = String(e) })
  .finally(() => {
    state.elapsed = Math.round(performance.now() - started)
    state.status = getRTLTextPluginStatus()
    out.textContent = JSON.stringify(state, null, 2)
  })
setTimeout(() => {
  state.status = getRTLTextPluginStatus()
  state.timedOut = !state.resolved
  out.textContent = JSON.stringify(state, null, 2)
}, 6000)
