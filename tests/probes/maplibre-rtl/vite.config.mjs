import { defineConfig } from 'vite'

export default defineConfig({
  // MapLibre 6 charge son worker par `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
  // Pré-bundlé dans .vite/deps, ce fichier voisin n'existe pas : le worker meurt.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
