// ESLint (flat config) för hela repot: React-klienten, Node-servern och testerna.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'test-results/**', 'playwright-report/**', 'docs/**', 'server/data/**']
  },
  js.configs.recommended,
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: '18.3' } },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/prop-types': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Grafikens SVG-ikoner är dekorativa och har aria-hidden; autofokus används medvetet i sökfält.
      'jsx-a11y/no-autofocus': 'off'
    }
  },
  {
    files: ['client/pwa/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker, __PRECACHE__: 'readonly' } }
  },
  {
    files: ['client/scripts/**', 'client/pwa/plugin.js', 'client/vite.config.js', 'client/vitest.config.js', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['client/src/**/*.test.{js,jsx}', 'client/src/test/**'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    files: ['tests/**/*.js', '**/*.cjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['server/**/*.js', 'tests/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] }
  }
];
