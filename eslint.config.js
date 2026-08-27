import js from '@eslint/js';
import globals from 'globals';

/**
 * Flat config, replacing `.eslintrc.json`.
 *
 * The eslintrc format was removed in ESLint 10, but the migration was overdue
 * for a second reason: eslintrc silently ignored every file whose path from the
 * working directory crossed a dot-directory. A checkout under `.claude/` or any
 * other dotted path made `npm run lint` exit 2 with "all of the files matching
 * the glob pattern '.' are ignored" — the linter appearing to be misconfigured
 * when nothing was wrong with the code. Flat config only ignores what `ignores`
 * lists.
 */
export default [
  {
    ignores: ['coverage/**', 'playwright-report/**', 'test-results/**', 'node_modules/**']
  },

  js.configs.recommended,

  {
    // Extension source: browser DOM plus the chrome.* namespace.
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...globals.webextensions
      }
    },
    rules: {
      // console.log is debug output that should not survive review; warn and
      // error are how this codebase reports real failures.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',

      // The extension's CSP forbids these outright. Catching them here gives a
      // better message than a runtime CSP violation in a packed extension.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // A promise rejection that nobody awaits disappears silently in a service
      // worker; every AI call in this codebase is async.
      'no-async-promise-executor': 'error',
      'require-atomic-updates': 'error'
    }
  },

  {
    // Tests run under Vitest with `globals: true`, and reach for `global.fetch`
    // and `global.chrome` from the Node side of the jsdom environment.
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.vitest }
    },
    rules: {
      'no-console': 'off'
    }
  },

  {
    // The one place console is the point rather than a leftover. Everywhere
    // else routes through this module precisely so the calls are in one file.
    files: ['utils/logger.js'],
    rules: {
      'no-console': 'off'
    }
  },

  {
    // Config files are Node modules, not extension code.
    files: ['*.config.js'],
    languageOptions: {
      globals: globals.node
    }
  }
];
