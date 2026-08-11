import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: [
      'tests/**/*.{test,spec}.{js,ts}',
      'src/**/*.{test,spec}.{js,ts}',
      '**/__tests__/**/*.{js,ts}'
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      'tests/e2e/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],

      // Report on every shipped source file, including ones no test imports.
      // Without this, a file with no tests is simply absent from the table and
      // reads as "fine" rather than "uncovered".
      all: true,
      include: [
        'background.js',
        'content.js',
        'options.js',
        'core/**/*.js',
        'providers/**/*.js',
        'scripts/**/*.js',
        'services/**/*.js',
        'src/**/*.js',
        'utils/**/*.js'
      ],
      exclude: ['coverage/**', 'dist/**', '**/node_modules/**', '**/*.config.*', '**/*.d.ts'],

      // Vitest reads these keys flat. The previous config nested them under a
      // `global` key — the Jest shape — which Vitest treats as a glob pattern
      // matching no file, so the gate silently enforced nothing while the suite
      // sat below the number it claimed to require.
      //
      // Set at the level the suite actually holds, so any regression fails the
      // build. Raise as coverage improves; never lower them to go green.
      //
      // The remaining drag is storage-service.js (~50%) and
      // validation-service.js (~67%) — pre-existing modules whose export,
      // import, and cleanup paths have no tests yet.
      thresholds: {
        statements: 83,
        branches: 83,
        functions: 84,
        lines: 83
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
      '@/core': resolve(__dirname, 'core'),
      '@/services': resolve(__dirname, 'services'),
      '@/utils': resolve(__dirname, 'utils'),
      '@/providers': resolve(__dirname, 'providers')
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'test'),
    global: 'globalThis'
  }
});