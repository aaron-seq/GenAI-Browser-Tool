import {
  test,
  expect,
  CONFIGURED_PREFERENCES,
  seedPreferences,
  FIXTURE_URL,
  activeTabId,
} from './fixtures.js';

async function openWorkspace(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html?workspace=1`);
  await seedPreferences(page, CONFIGURED_PREFERENCES);
  await page.reload();
  return page;
}

async function importText(page, text, name = 'learning-book.txt') {
  await page
    .locator('#document-file')
    .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  await expect(page.locator('#current-page-title')).toHaveText(name);
  await expect(page.locator('#loading-overlay')).toBeHidden();
}

test('book questions find late evidence, remember the thread, and clear it', async ({
  context,
  extensionId,
}, testInfo) => {
  const requests = [];
  await context.route('https://api.anthropic.com/**', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        content: [
          {
            type: 'text',
            text: 'The heliotrope experiment produced 73 amber crystals.',
          },
        ],
      }),
    });
  });
  const book = `${'A chapter about general background. '.repeat(3000)}\nThe heliotrope experiment produced 73 amber crystals.`;
  const page = await openWorkspace(context, extensionId);
  await importText(page, book);
  expect(requests).toHaveLength(0);
  await page.locator('[data-tab="chat"]').click();
  await page
    .locator('#chat-input')
    .fill('How many amber crystals did the heliotrope experiment produce?');
  await page.locator('#send-chat-btn').click();
  await expect(page.locator('#chat-history')).toContainText(
    '73 amber crystals'
  );
  await expect(page.locator('.chat-sources')).toContainText('passages used');
  expect(requests).toHaveLength(1);
  expect(requests[0].messages[0].content).toContain('73 amber crystals');
  await page.locator('.chat-sources summary').click();
  await expect(page.locator('.chat-sources p')).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath('learning-workspace.png'),
    fullPage: true,
  });

  await page.reload();
  await importText(page, book);
  await page.locator('[data-tab="chat"]').click();
  await expect(page.locator('#chat-history')).toContainText(
    '73 amber crystals'
  );
  await expect(page.locator('#chat-memory-status')).toContainText('Restored 1');
  expect(requests).toHaveLength(1);
  await page.locator('#clear-chat-btn').click();
  await expect(page.locator('#chat-memory-status')).toContainText(
    'Chat cleared'
  );
  await expect(page.locator('#chat-history')).toBeEmpty();
  await page.reload();
  await importText(page, book);
  await expect(page.locator('#chat-history')).toBeEmpty();
});

test('saved summaries render again without a second provider call', async ({
  context,
  extensionId,
}) => {
  let calls = 0;
  await context.route('https://api.anthropic.com/**', async route => {
    calls++;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        content: [
          {
            type: 'text',
            text: '- Plants convert light into stored chemical energy.',
          },
        ],
      }),
    });
  });
  const page = await openWorkspace(context, extensionId);
  const text = 'Photosynthesis converts light into stored chemical energy.';
  await importText(page, text);
  await page.locator('#generate-summary-btn').click();
  await expect(page.locator('#summary-content')).toContainText(
    'chemical energy'
  );
  await expect(page.locator('#loading-overlay')).toBeHidden();
  await page.reload();
  await importText(page, text);
  await expect(page.locator('#summary-confidence')).toContainText(
    'Saved summary'
  );
  await page.locator('#generate-summary-btn').click();
  await expect(page.locator('#loading-overlay')).toBeHidden();
  await expect(page.locator('#summary-confidence')).toContainText(
    'Saved summary'
  );
  expect(calls).toBe(1);
});

test('workspace reads its source tab rather than the new extension tab', async ({
  context,
  extensionId,
}) => {
  const source = await context.newPage();
  await source.goto(FIXTURE_URL);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await source.bringToFront();
  const tabId = await activeTabId(page);
  await page.goto(
    `chrome-extension://${extensionId}/popup.html?workspace=1&tabId=${tabId}`
  );
  await expect(page.locator('#current-page-title')).toHaveText(
    'Understanding Service Workers'
  );
  await expect(page.locator('#current-page-status')).toContainText('Ready');
  await expect(page.locator('#page-overview')).toContainText(
    'Understanding Service Workers'
  );
});

test('options test the entered provider key through the worker', async ({
  context,
  extensionId,
}) => {
  let calls = 0;
  await context.route('https://api.anthropic.com/**', async route => {
    calls++;
    expect(route.request().headers()['x-api-key']).toBe('sk-ant-e2e-probe');
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }),
    });
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.locator('#anthropic-key').fill('sk-ant-e2e-probe');
  await page.locator('[data-test-provider="anthropic"]').click();
  await expect(page.locator('#anthropic-test-status')).toContainText(
    'Connected'
  );
  expect(calls).toBe(1);
  await expect(page.locator('[data-test-provider="anthropic"]')).toBeEnabled();
});
