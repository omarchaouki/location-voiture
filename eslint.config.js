import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

/**
 * Ce qui est déterministe doit être une règle, pas une bonne intention.
 *
 * Les contrôles que ESLint ne sait pas faire (chaînes en dur, classes de marge
 * physiques) sont dans `scripts/check-hardcoded.ts`, appelé par le même hook.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.output/**',
      '.nitro/**',
      'node_modules/**',
      'src/routeTree.gen.ts',
      // Greffon RTL recopié tel quel depuis le paquet (`pnpm vendor:rtl`). On ne
      // linte pas le code d'un tiers : le corriger reviendrait à le forker.
      'public/vendor/**',
      // Sonde MapLibre : du code de laboratoire, hors du produit.
      'tests/probes/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Les bugs d'`await` oublié dans une server function : la raison pour laquelle
      // on reste en TypeScript 6 plutôt que 7 (docs/DECISIONS.md §2.3).
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // `throw redirect()` et `throw notFound()` sont les mécanismes du routeur,
      // pas des erreurs jetées à la légère : ce sont eux qui rendent 404 plutôt
      // que 403 sur une ressource d'une autre organisation.
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            { from: 'package', package: '@tanstack/router-core', name: ['Redirect', 'NotFoundError'] },
          ],
        },
      ],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      'no-console': ['error', { allow: ['warn', 'error'] }],

      /*
       * UN seul jeu d'icônes tiers, et c'est `lucide-react` (refonte shadcn/ui du
       * 26/08/2026). Deux jeux dans un même produit, ce sont deux graisses de trait
       * et deux rayons d'angle dans la même barre d'outils.
       *
       * Le jeu MAISON reste la référence pour les objets du métier — voiture, clé,
       * bidon d'huile, plaque, cachet : voir `src/ui/icons/` et docs/DESIGN.md §6.
       */
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@heroicons/react', message: 'Un seul jeu tiers : lucide-react.' },
            { name: 'react-icons', message: 'Un seul jeu tiers : lucide-react.' },
          ],
        },
      ],
    },
  },

  // Le formatage `Intl` passe par src/i18n/format.ts, et par lui seul (É6).
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/i18n/format.ts', 'src/i18n/locales.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'Intl',
          message:
            'Passer par src/i18n/format.ts : la locale `ar` nue n’a pas les mêmes séparateurs que `ar-MA` (docs/DECISIONS.md É6).',
        },
      ],
    },
  },

  {
    // Les points d'entrée en ligne de commande écrivent sur la sortie standard : c'est
    // leur interface. `server.mjs` en fait partie — sa ligne de démarrage est ce que
    // `journalctl -u flotta` affiche en premier quand on cherche pourquoi rien ne répond.
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'server.mjs'],
    rules: { 'no-console': 'off' },
  },

  // En dernier : les fichiers de configuration JS ne sont pas dans le programme
  // TypeScript, donc pas de règles typées sur eux.
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
)
