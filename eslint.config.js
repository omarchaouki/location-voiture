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

      // Le jeu d'icônes est maison. Une icône manquante se dessine, elle ne s'installe pas.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'lucide-react', message: "Jeu d'icônes maison : voir src/ui/icons/." },
            { name: '@heroicons/react', message: "Jeu d'icônes maison : voir src/ui/icons/." },
            { name: 'react-icons', message: "Jeu d'icônes maison : voir src/ui/icons/." },
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
    files: ['scripts/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  // En dernier : les fichiers de configuration JS ne sont pas dans le programme
  // TypeScript, donc pas de règles typées sur eux.
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
)
