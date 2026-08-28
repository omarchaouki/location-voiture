import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // Les dates sont figées dans chaque test : aucun test ne dépend de l'heure réelle.
    restoreMocks: true,
    /*
     * 20 s au lieu de 5 s par défaut.
     *
     * Les tests d'authentification hachent de vrais mots de passe : seuls, ils passent
     * en 9 s ; lancés en parallèle du reste de la suite, ils franchissaient les 5 s et
     * échouaient au hasard. Un test qui échoue une fois sur trois n'est pas un test,
     * c'est du bruit que l'équipe apprend à ignorer.
     */
    testTimeout: 20_000,
    /*
     * Les `beforeEach` montent une base Postgres en mémoire (tests/helpers/db.ts). Sur un
     * cache froid — machine neuve, ou migration qui vient d'être générée — le tout premier
     * démarrage de PGlite coûte une dizaine de secondes, une seule fois. Les 10 s par
     * défaut de Vitest tombaient pile dessus, et le message parlait de « hook timed out »
     * sans jamais nommer la base.
     */
    hookTimeout: 60_000,
  },
})
