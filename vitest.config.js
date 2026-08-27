import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],

    // Playwright owns tests/e2e; running those specs under Vitest would try to
    // launch a browser from inside jsdom.
    include: ['tests/**/*.test.js'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],

      // Listed explicitly rather than left to inference. Vitest only reports
      // files a test imported, so a file with no tests at all silently vanished
      // from the report and *raised* the percentage — the opposite of what a
      // coverage gate is for. Naming the shipped source keeps an untested file
      // visible at 0%.
      include: [
        'background.js',
        'content.js',
        'options.js',
        'core/**/*.js',
        'providers/**/*.js',
        'scripts/**/*.js',
        'services/**/*.js',
        'utils/**/*.js'
      ],

      // Flat keys. These lived under a `thresholds.global` object, which is the
      // c8/Vitest 0.x shape; Vitest ignored it entirely, so the gate reported
      // 63% against a 70% threshold and still exited 0.
      //
      // Set a few points under what the suite actually achieves, so an ordinary
      // refactor does not fail CI but a real regression does.
      thresholds: {
        branches: 72,
        functions: 85,
        lines: 88,
        statements: 85
      }
    },

    testTimeout: 10000,
    hookTimeout: 10000
  }
});
