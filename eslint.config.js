import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '**/.wrangler', 'debug', 'test-reports', '.claude']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
  {
    // Signal / connector lookups go through src/typeRegistry, which knows community and
    // user types and falls back for unknown ids. Indexing the built-in tables directly
    // silently drops every non-built-in type.
    files: ['**/*.{ts,tsx}'],
    // devApi.ts is the TypeDoc surface: it re-exports the tables on purpose.
    ignores: ['src/typeRegistry.ts', 'src/signalColors.ts', 'src/devApi.ts', '**/__tests__/**', 'e2e/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            regex: '(^|/)builtinTypeTables$',
            message: 'Read built-in type tables through the src/typeRegistry getters.',
          },
          {
            regex: '(^|/)types$',
            importNames: ['SIGNAL_LABELS', 'SIGNAL_COLORS', 'CONNECTOR_LABELS', 'SIGNAL_GROUPS', 'CONNECTOR_GROUPS'],
            message: 'Use the src/typeRegistry getters (signalLabel, signalCssColor, signalGroups, …).',
          },
        ],
      }],
    },
  },
  {
    files: ['**/main.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
