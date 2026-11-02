import {
  test,
  expect,
  CONFIGURED_PREFERENCES,
  seedPreferences,
  FIXTURE_URL,
  activeTabId,
} from './fixtures.js';

// Delay delivery after the real worker has produced its response. Storage and
// provider handling still run normally; only the UI message timing is controlled.
async function delayResponse(page, action) {
  await page.addInitScript(actionType => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async message => {
      const response = await send(message);
      if (message.actionType === actionType) {
        await new Promise(resolve => {
          window.releaseResponse = resolve;
        });
        window.responseReleased = true;
      }
      return response;
    };
  }, action);
}

async function releaseResponse(page) {
  await page.evaluate(() => window.releaseResponse());
  await page.waitForFunction(() => window.responseReleased);
  // Let the controller's awaiting message continuation finish before asserting
  // that no stale UI or conversation state was applied.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
}

async function importBook(page, name = 'book-B.txt') {
  await page.locator('#document-file').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from('Book B is about bananas.'),
  });
  await expect(page.locator('#current-page-title')).toHaveText(name);
  await expect(page.locator('#loading-overlay')).toBeHidden();
}

test('a late source extraction cannot replace an imported book', async ({
  context,
  extensionId,
}) => {
  const setup = await context.newPage();
  await setup.goto(`chrome-extension://${extensionId}/options.html`);
  await seedPreferences(setup, CONFIGURED_PREFERENCES);
  const source = await context.newPage();
  await source.goto(FIXTURE_URL);
  const tabId = await activeTabId(setup);
  const page = await context.newPage();
  await delayResponse(page, 'EXTRACT_PAGE_CONTENT');
  await page.goto(
    `chrome-extension://${extensionId}/popup.html?workspace=1&tabId=${tabId}`
  );
  await page.waitForFunction(() => Boolean(window.releaseResponse));
  await importBook(page);
  await releaseResponse(page);
  await expect(page.locator('#current-page-title')).toHaveText('book-B.txt');
  await expect(page.locator('#current-page-status')).toContainText('Ready');
  await page.locator('[data-tab="tools"]').click();
  await page.locator('#page-stats-btn').click();
  await expect(page.locator('#tools-results')).toContainText('5 words');
});

test('a late analysis result cannot populate the next book', async ({
  context,
  extensionId,
}) => {
  await context.route('https://api.anthropic.com/**', route =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        content: [{ type: 'text', text: 'Old book insight' }],
      }),
    })
  );
  const page = await context.newPage();
  await delayResponse(page, 'EXTRACT_KEY_INSIGHTS');
  await page.goto(`chrome-extension://${extensionId}/popup.html?workspace=1`);
  await seedPreferences(page, CONFIGURED_PREFERENCES);
  await importBook(page, 'book-A.txt');
  await page.locator('[data-tab="analyze"]').click();
  await page.locator('[data-type="insights"]').click();
  await page.waitForFunction(() => Boolean(window.releaseResponse));
  await importBook(page);
  await releaseResponse(page);
  await expect(page.locator('#insights-result')).toHaveText(
    'Run this analysis for this document.'
  );
  await expect(page.locator('#current-page-title')).toHaveText('book-B.txt');
});

test('cleared chat stays cleared when an earlier history response arrives', async ({
  context,
  extensionId,
}) => {
  const requests = [];
  await context.route('https://api.anthropic.com/**', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        content: [{ type: 'text', text: 'A saved answer' }],
      }),
    });
  });
  const setup = await context.newPage();
  await setup.goto(`chrome-extension://${extensionId}/options.html`);
  await seedPreferences(setup, CONFIGURED_PREFERENCES);
  const source = await context.newPage();
  await source.goto(FIXTURE_URL);
  const tabId = await activeTabId(setup);
  const page = await context.newPage();
  await page.goto(
    `chrome-extension://${extensionId}/popup.html?workspace=1&tabId=${tabId}`
  );
  await expect(page.locator('#current-page-status')).toContainText('Ready');
  await page.locator('[data-tab="chat"]').click();
  await page.locator('#chat-input').fill('Remember this old question');
  await page.locator('#send-chat-btn').click();
  await expect(page.locator('#chat-history')).toContainText('A saved answer');
  await expect(page.locator('#loading-overlay')).toBeHidden();
  await delayResponse(page, 'GET_DOCUMENT_HISTORY');
  await page.reload();
  await page.waitForFunction(() => Boolean(window.releaseResponse));
  await page.locator('[data-tab="chat"]').click();
  await page.locator('#clear-chat-btn').click();
  await expect(page.locator('#chat-memory-status')).toContainText(
    'Chat cleared'
  );
  await releaseResponse(page);
  await expect(page.locator('#chat-history')).toBeEmpty();
  await expect(page.locator('#chat-memory-status')).toContainText(
    'Chat cleared'
  );
  expect(
    await page.evaluate(
      async () =>
        (await chrome.storage.local.get('genai_conversation_history'))
          .genai_conversation_history
    )
  ).toEqual([]);
  await page.locator('#chat-input').fill('A fresh question');
  await page.locator('#send-chat-btn').click();
  await expect(page.locator('#chat-history')).toContainText('A saved answer');
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[1])).not.toContain(
    'Remember this old question'
  );
});
