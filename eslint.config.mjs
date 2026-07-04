import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['.wxt/**', '.output/**', 'node_modules/**', 'extension/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      globals: {
        // WXT auto-imports + browser/DOM globals used across content scripts and the panel
        defineBackground: 'readonly',
        defineContentScript: 'readonly',
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
        prompt: 'readonly',
        MessageEvent: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLDivElement: 'readonly',
        HTMLStyleElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        HTMLSelectElement: 'readonly',
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Monaco / page globals are untyped; `any` is pragmatic at those boundaries
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // We intentionally reset/load state when the active problem changes (sync-by-key pattern);
      // keep these as warnings rather than hard errors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
