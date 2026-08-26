import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  /*
   * MapLibre 6 charge son worker par `new URL('./maplibre-gl-worker.mjs', import.meta.url)`.
   * Pré-bundlé par Vite dans `.vite/deps`, ce fichier voisin n'est pas émis : le worker
   * meurt en silence, la carte n'affiche plus une seule étiquette, et le symptôme
   * ressemble trait pour trait à une incompatibilité du greffon RTL. Vérifié en
   * Phase 7 — voir docs/DECISIONS.md §2.4 et tests/probes/maplibre-rtl/.
   */
  optimizeDeps: { exclude: ['maplibre-gl'] },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
