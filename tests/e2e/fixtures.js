import { test as base, chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const extensionPath = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** A page the content script will actually inject into (matches https://*\/*). */
export const FIXTURE_URL = 'https://fixture.test/article';

export const FIXTURE_HTML = `<!DOCTYPE html>
<html lang="en">
  <head><title>Understanding Service Workers</title></head>
  <body>
    <nav>Home About Contact</nav>
    <article>
      <h1>Understanding Service Workers</h1>
      <p>Service workers run separately from the page and have no DOM access.</p>
      <p>They are the correct place for an extension to perform network requests.</p>
      <a href="https://example.com/spec">The specification</a>
    </article>
    <footer>Copyright notice that should not be summarized.</footer>
  </body>
</html>`;

/**
 * Launches real Chrome with this repository loaded as an unpacked extension.
 *
 * Extensions require a persistent context — `browser.newContext()` silently
 * ignores `--load-extension`, which is why the previous version of this suite
 * could never have tested the extension at all.
 */
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'genai-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // `channel: 'chromium'` selects the full browser build. The default
      // headless *shell* has no extension support at all, so without this the
      // extension silently never loads and every test fails on a missing worker.
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    // Serve the fixture page locally so no test touches the real network.
    await context.route(`${FIXTURE_URL}**`, route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE_HTML })
    );

    await use(context);

    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },

  /** The loaded extension's id, read from its service worker URL. */
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');

    const id = worker.url().split('/')[2];
    await use(id);
  }
});

/**
 * Write preferences directly into the extension's storage, so tests can start
 * from a configured state without driving the options UI every time.
 *
 * @param {import('@playwright/test').Page} page  A page on an extension URL.
 * @param {any} preferences
 */
export async function seedPreferences(page, preferences) {
  await page.evaluate(
    prefs => chrome.storage.sync.set({ user_preferences: prefs }),
    preferences
  );
}

/**
 * Resolve the id of the currently active tab, from a page running in the
 * extension's own context.
 *
 * Deliberately queries the way the popup does. Filtering by `url` instead would
 * require the `tabs` permission, which this extension does not request — a
 * `chrome.tabs.query({ url })` call simply returns an empty array without it.
 * `Tab.id` is available regardless of permissions; `Tab.url` is not.
 *
 * @param {import('@playwright/test').Page} extensionPage
 * @returns {Promise<number>}
 */
export async function activeTabId(extensionPage) {
  return extensionPage.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab.id;
  });
}

/** Preferences with a fake Anthropic key; provider calls are intercepted. */
export const CONFIGURED_PREFERENCES = {
  preferredProvider: 'anthropic',
  apiKeys: { anthropic: 'sk-ant-e2e-fake-key' },
  models: {},
  summaryType: 'key-points',
  summaryLength: 'medium',
  targetLanguage: 'en',
  features: { contextMenus: true, notifications: true, saveHistory: true }
};

export { expect };
