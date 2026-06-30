const nextPlugin = require('@next/eslint-plugin-next')
const reactHooks = require('eslint-plugin-react-hooks')

/**
 * Minimal Next.js 15 flat config for ESLint 9.
 *
 * eslint-config-next v15.5 still ships a legacy eslintrc-shaped config
 * (with `extends: ['plugin:@next/next/recommended', ...]`) which ESLint 9
 * flat config cannot consume directly. Instead of rewriting that translation
 * here, we wire the two highest-value Next.js plugins directly:
 *   - @next/eslint-plugin-next: catches next/link, next/image, server-only
 *   - eslint-plugin-react-hooks: enforces Rules of Hooks
 *
 * We intentionally do NOT pull in eslint-plugin-react / jsx-a11y here —
 * adding them can be done per-route as the page count grows.
 *
 * Note: this project's lint script intentionally runs eslint + stylelint,
 * so a "0 errors" baseline means both pass.
 */
module.exports = [
  {
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message: 'No direct fetch from components. Use apiClient from lib/apiClient.ts.',
        },
      ],
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', '**/*.css'],
  },
]