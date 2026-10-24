import {
  test,
  expect,
  CONFIGURED_PREFERENCES,
  seedPreferences,
} from './fixtures.js';

test('failed option reads preserve stored settings, report errors, and recover on reload', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;
  await page.goto(optionsUrl);
  const prefs = {
    ...CONFIGURED_PREFERENCES,
    features: { contextMenus: false, notifications: false, saveHistory: false },
  };
  await seedPreferences(page, prefs);
  await page.reload();
  await page.evaluate(() => {
    const read = chrome.storage.sync.get.bind(chrome.storage.sync);
    chrome.storage.sync.get = () => {
      chrome.storage.sync.get = read;
      return Promise.reject(new Error('simulated settings read failure'));
    };
  });
  await page.locator('[data-section="features"]').click();
  await page.locator('#summary-type-pref').selectOption('tldr');
  await expect(page.locator('#save-indicator .text')).toContainText(
    'Could not save'
  );
  expect(
    await page.evaluate(
      async () =>
        (await chrome.storage.sync.get('user_preferences')).user_preferences
    )
  ).toEqual(prefs);
  await page.locator('#summary-type-pref').selectOption('technical');
  await expect(page.locator('#save-indicator .text')).toHaveText(
    'Settings saved'
  );
  const saved = await page.evaluate(
    async () =>
      (await chrome.storage.sync.get('user_preferences')).user_preferences
  );
  expect(saved).toMatchObject({ ...prefs, summaryType: 'technical' });

  await page.addInitScript(() => {
    if (!location.search.includes('fault=1')) return;
    const read = chrome.storage.sync.get.bind(chrome.storage.sync);
    chrome.storage.sync.get = () => {
      chrome.storage.sync.get = read;
      return Promise.reject(new Error('simulated settings read failure'));
    };
  });
  await page.goto(`${optionsUrl}?fault=1`);
  await expect(page.getByRole('alert')).toContainText('Reload');
  await expect(page.locator('#anthropic-key')).toBeDisabled();
  await expect(page.locator('#reset-settings')).toBeDisabled();
  expect(
    await page.evaluate(
      async () =>
        (await chrome.storage.sync.get('user_preferences')).user_preferences
    )
  ).toEqual(saved);
  await page.goto(optionsUrl);
  await expect(page.locator('#anthropic-key')).toBeEnabled();
  await expect(page.locator('#anthropic-key')).toHaveValue(
    prefs.apiKeys.anthropic
  );
  expect(errors).toEqual([]);
});

test('a final settings read failure keeps the summary visible without saving history', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html?workspace=1`);
  await seedPreferences(page, {
    ...CONFIGURED_PREFERENCES,
    features: { contextMenus: false, notifications: false, saveHistory: false },
  });
  await page.reload();
  await page.locator('#document-file').setInputFiles({
    name: 'fixture.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('A harmless fixture about browser extensions.'),
  });
  await expect(page.locator('#current-page-status')).toContainText('Ready');
  const worker = context.serviceWorkers()[0];
  await context.route('https://api.anthropic.com/**', async route => {
    await worker.evaluate(() => {
      const read = chrome.storage.sync.get.bind(chrome.storage.sync);
      chrome.storage.sync.get = () => {
        chrome.storage.sync.get = read;
        return Promise.reject(new Error('simulated settings read failure'));
      };
    });
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        content: [{ type: 'text', text: '- A preserved fixture summary.' }],
      }),
    });
  });
  await page.locator('#generate-summary-btn').click();
  await expect(page.locator('#summary-content')).toContainText(
    'preserved fixture summary'
  );
  await expect(page.locator('#summary-confidence')).toContainText('Not saved');
  const local = await page.evaluate(() =>
    chrome.storage.local.get([
      'genai_summary_history',
      'genai_conversation_history',
    ])
  );
  expect(local).toEqual({});
});
