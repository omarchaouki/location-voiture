import { defineConfig, loadEnv } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

/**
 * Le `.env` dans `process.env`, et pas seulement dans `import.meta.env`.
 *
 * Vite charge `.env` pour le CLIENT, sous forme de constantes remplacées à la
 * compilation. Le code SERVEUR, lui, lit `process.env` — `DATABASE_URL`, `AUTH_SECRET`,
 * le jeton ZeptoMail — et Node ne lit aucun `.env` tout seul. Tant que la base avait une
 * valeur par défaut (`file:./data/dev.db`), personne ne s'en apercevait ; depuis la
 * bascule Postgres, `pnpm dev` s'arrêterait net sur « DATABASE_URL est absent ».
 *
 * On n'ÉCRASE jamais une variable déjà posée : en production, systemd fournit
 * l'environnement, et un `.env` traînant sur le serveur ne doit pas pouvoir le
 * contredire en silence.
 *
 * Le troisième argument est `''` — préfixe vide — pour charger AUSSI les variables sans
 * `VITE_`. Elles ne partent pas au navigateur pour autant : seul ce qui est lu dans du
 * code client passe dans le paquet, et le code serveur n'y est pas.
 */
export default defineConfig(({ mode }) => {
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
    process.env[key] ??= value
  }

  return {
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
  }
})
