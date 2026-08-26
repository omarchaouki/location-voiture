/**
 * Reproduit EXACTEMENT le chargeur de MapLibre 6.5 (fetch + eval dans un worker
 * module), puis appelle les fonctions du greffon sur du texte arabe.
 */
const cp = (s) => [...s].map((c) => c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' ')

self.onmessage = async (event) => {
  const { url } = event.data
  const result = { url }
  try {
    let methods = null
    self.registerRTLTextPlugin = (m) => { methods = m }

    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) throw new Error(`fetch ${response.status}`)
    const source = await response.text()
    result.isEsm = /^[ \t]*(import|export)\s/m.test(source)
    if (result.isEsm) {
      const blob = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
      await import(blob)
    } else {
      globalThis.eval(source)
    }

    result.registeredSync = methods !== null
    // Le greffon peut s'enregistrer APRÈS une initialisation asynchrone (wasm).
    for (let i = 0; i < 100 && methods === null; i++) {
      await new Promise((r) => setTimeout(r, 20))
    }
    result.registered = methods !== null
    if (!methods) throw new Error('registerRTLTextPlugin jamais appelé')
    result.methods = Object.keys(methods)

    const input = 'شارع محمد الخامس'
    const shaped = methods.applyArabicShaping(input)
    result.shapedChanged = shaped !== input
    result.shapedSample = cp(shaped.slice(0, 6))
    result.bidi = methods.processBidirectionalText('الدار البيضاء 12345', [])
  } catch (error) {
    result.error = String(error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error)
  }
  self.postMessage(result)
}
