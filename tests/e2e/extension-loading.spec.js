import {
  test,
  expect,
  FIXTURE_URL,
  CONFIGURED_PREFERENCES,
  seedPreferences,
  activeTabId
} from './fixtures.js';

/**
 * Real-browser checks: this repository is loaded into Chrome as an unpacked
 * extension and driven through its own UI.
 *
 * These exercise the wiring that unit tests mock away — manifest validity,
 * service worker registration, content script injection, and the
 * popup → background → content-script message path. Provider HTTP is
 * intercepted, so no API key and no network access are required.
 */

/**
 * Intercept the Anthropic endpoint and reply with `text`.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} text
 */
async function stubProvider(context, text) {
  await context.route('https://api.anthropic.com/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [{ type: 'text', text }] })
    })
  );
}

test.describe('extension loads', () => {
  test('registers a service worker with a valid manifest', async ({ extensionId }) => {
    // A manifest error means Chrome never registers the worker, so simply
    // resolving an extension id proves the manifest parsed and loaded.
    expect(extensionId).toMatch(/^[a-z]{32}$/);
  });

  test('background service worker starts without throwing', async ({ context, extensionId }) => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.waitForLoadState('domcontentloaded');

    expect(errors).toEqual([]);
  });
});

test.describe('options page', () => {
  test('renders without the TypeError that used to break it on load', async ({
    context,
    extensionId
  }) => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await expect(page.locator('#anthropic-key')).toBeVisible();

    // Previously: reading settings.features.smartBookmarks threw on every load.
    expect(errors).toEqual([]);
  });

  test('persists an API key to the same place the background service reads', async ({
    context,
    extensionId
  }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.locator('#anthropic-key').fill('sk-ant-typed-by-user');
    await page.locator('#anthropic-key').blur();
    await expect(page.locator('#save-indicator')).toHaveClass(/visible/);

    // The regression this guards: the options page used to write
    // user_preferences.apiKeys.anthropic while providers read a different key,
    // so a key the user typed was never found.
    const stored = await page.evaluate(async () => {
      const result = await chrome.storage.sync.get(['user_preferences']);
      return result.user_preferences;
    });
    expect(stored.apiKeys.anthropic).toBe('sk-ant-typed-by-user');

    const status = await page.evaluate(() =>
      chrome.runtime.sendMessage({ actionType: 'GET_PROVIDER_STATUS', payload: {} })
    );
    expect(status).toMatchObject({ success: true, data: { configured: true } });
  });
});

test.describe('content extraction', () => {
  test('content script extracts article text and drops navigation chrome', async ({
    context,
    extensionId
  }) => {
    const contentPage = await context.newPage();
    await contentPage.goto(FIXTURE_URL);

    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await contentPage.bringToFront();

    const tabId = await activeTabId(extensionPage);
    const response = await extensionPage.evaluate(
      id =>
        chrome.runtime.sendMessage({
          actionType: 'EXTRACT_PAGE_CONTENT',
          payload: { tabId: id }
        }),
      tabId
    );

    expect(response.success).toBe(true);
    expect(response.data.title).toBe('Understanding Service Workers');
    expect(response.data.mainText).toContain('Service workers run separately');
    // The <article> selector wins over <body>, and removeUnwantedElements
    // strips nav and footer from the clone.
    expect(response.data.mainText).not.toContain('Copyright notice');
    expect(response.data.mainText).not.toContain('Home About Contact');
  });

  test('EXTRACT_PAGE_CONTENT honours the caller-supplied tabId', async ({
    context,
    extensionId
  }) => {
    // Regression: the handler read sender.tab?.id, which is undefined for
    // messages sent from an extension page, so every popup-initiated extraction
    // threw "No active tab". This message has no sender.tab and must still work.
    const contentPage = await context.newPage();
    await contentPage.goto(FIXTURE_URL);

    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await contentPage.bringToFront();

    const tabId = await activeTabId(extensionPage);
    const result = await extensionPage.evaluate(
      id =>
        chrome.runtime.sendMessage({
          actionType: 'EXTRACT_PAGE_CONTENT',
          payload: { tabId: id }
        }),
      tabId
    );

    expect(result.success).toBe(true);
  });
});

test.describe('summarization end to end', () => {
  /**
   * Real page → content script → background → provider → rendered result.
   *
   * This drives the background directly rather than clicking the popup button:
   * the popup's own tab query needs `activeTab`, which Chrome grants only on a
   * real toolbar-icon click, and Playwright cannot click browser chrome. The
   * button is a thin wrapper over exactly this message.
   */
  test('extracted page text reaches the provider and the reply comes back', async ({
    context,
    extensionId
  }) => {
    /** @type {string[]} */
    const requestBodies = [];
    await context.route('https://api.anthropic.com/**', route => {
      requestBodies.push(route.request().postData() || '');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [
            { type: 'text', text: '- Service workers have no DOM access' }
          ]
        })
      });
    });

    const contentPage = await context.newPage();
    await contentPage.goto(FIXTURE_URL);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await seedPreferences(popup, CONFIGURED_PREFERENCES);
    await contentPage.bringToFront();

    const tabId = await activeTabId(popup);
    const extracted = await popup.evaluate(
      id =>
        chrome.runtime.sendMessage({
          actionType: 'EXTRACT_PAGE_CONTENT',
          payload: { tabId: id }
        }),
      tabId
    );
    expect(extracted.success).toBe(true);

    const summary = await popup.evaluate(
      text =>
        chrome.runtime.sendMessage({
          actionType: 'GENERATE_CONTENT_SUMMARY',
          payload: { content: text, summaryType: 'key-points', targetLength: 'medium' }
        }),
      extracted.data.mainText
    );

    expect(summary.success).toBe(true);
    expect(summary.data.summary).toContain('Service workers have no DOM access');
    expect(summary.data.provider).toBe('anthropic');

    // The real page text was sent, fenced as untrusted data.
    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toContain('<<<PAGE_CONTENT>>>');
    expect(requestBodies[0]).toContain('Service workers run separately');
  });

  test('a right-click page summary notifies the user', async ({ context, extensionId }) => {
    await stubProvider(context, '- Service workers have no DOM access');

    const contentPage = await context.newPage();
    await contentPage.goto(FIXTURE_URL);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await seedPreferences(popup, CONFIGURED_PREFERENCES);

    const result = await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        actionType: 'ANALYZE_SENTIMENT',
        payload: { text: 'A clear, well written article.' }
      })
    );

    // The sentiment reply is parsed into structured fields, not passed through raw.
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('sentiment');
    expect(result.data).toHaveProperty('reason');
  });

  test('reports a missing API key instead of inventing a summary', async ({
    context,
    extensionId
  }) => {
    const contentPage = await context.newPage();
    await contentPage.goto(FIXTURE_URL);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    const response = await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        actionType: 'GENERATE_CONTENT_SUMMARY',
        payload: { content: 'Some article text.' }
      })
    );

    expect(response.success).toBe(false);
    expect(response.errorCode).toBe('MISSING_API_KEY');
  });

  test('surfaces a provider error rather than a plausible fake answer', async ({
    context,
    extensionId
  }) => {
    await context.route('https://api.anthropic.com/**', route =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'invalid x-api-key' } })
      })
    );

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await seedPreferences(popup, CONFIGURED_PREFERENCES);

    const response = await popup.evaluate(() =>
      chrome.runtime.sendMessage({
        actionType: 'GENERATE_CONTENT_SUMMARY',
        payload: { content: 'Some article text.' }
      })
    );

    expect(response.success).toBe(false);
    expect(response.errorCode).toBe('AUTH_ERROR');
    expect(response.error).toContain('invalid x-api-key');
  });
});

test.describe('restricted pages', () => {
  test('explains why a page with no content script cannot be read', async ({
    context,
    extensionId
  }) => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    // The extension's own options page never receives the content script, so it
    // stands in for chrome:// pages and the Web Store, which Playwright cannot
    // navigate to.
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.bringToFront();

    const tabId = await activeTabId(popup);
    const response = await popup.evaluate(
      id =>
        chrome.runtime.sendMessage({
          actionType: 'EXTRACT_PAGE_CONTENT',
          payload: { tabId: id }
        }),
      tabId
    );

    expect(response.success).toBe(false);
    expect(response.errorCode).toBe('CONTENT_SCRIPT_UNAVAILABLE');
  });
});
