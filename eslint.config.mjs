import tseslint from 'typescript-eslint';
import jestPlugin from 'eslint-plugin-jest';

/**
 * ESLint flat config for Athar backend.
 *
 * Layers:
 *  1. base recommended (typescript-eslint)
 *  2. project-wide correctness rules
 *  3. architecture guardrail (engine seam enforcement)
 *  4. production: no implicit `any`
 *  5. test-file relaxations + jest globals
 *
 * Generated Prisma client and build artifacts are never linted.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'src/generated/**'],
  },
  ...tseslint.configs.recommended,

  // 2. Project-wide correctness rules (production + tests)
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'warn',
    },
  },

  // 3. Architecture guardrail: AI/search SDKs may ONLY be imported behind the
  // engine providers. Services must depend on ContentProvider / ImageProvider /
  // SearchProvider seams, never on the vendor SDK directly. (See CLAUDE.md.)
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@anthropic-ai/sdk',
              message:
                'Import the Claude SDK only inside src/engine/providers/**. Depend on ContentProvider elsewhere.',
            },
            {
              name: 'openai',
              message:
                'Import the OpenAI SDK only inside src/engine/providers/**. Depend on ImageProvider elsewhere.',
            },
          ],
        },
      ],
    },
  },
  {
    // The providers ARE the seam — they are allowed to touch the vendor SDKs.
    files: ['src/engine/providers/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // 4. Production code: no implicit `any`. Every `any` must be a deliberate,
  // commented `eslint-disable-next-line` at a genuine external boundary.
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // 5. Test files: looser typing, jest globals.
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    plugins: { jest: jestPlugin },
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
