import { defineConfig } from '@playwright/test';

/**
 * E2E configuration.
 *
 * Chrome extensions can only be loaded into a *persistent* context, so each test
 * launches its own context via the fixture in tests/e2e/fixtures.js rather than
 * using Playwright's default `page`. There is no `use.browserName` or
 * `launchOptions` here for that reason — the fixture owns browser launch.
 *
 * There is also no `webServer`: the extension is a browser extension, not a web
 * app, and the tests serve their fixture pages by intercepting requests.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Each test launches a browser with its own profile directory; running them in
  // parallel on one machine is slow and flaky.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['html'], ['list']] : 'list',
  timeout: 30000,

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  }
});
