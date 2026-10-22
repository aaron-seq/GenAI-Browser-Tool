import {
  test,
  expect,
  CONFIGURED_PREFERENCES,
  seedPreferences,
} from './fixtures.js';

test('options apply menu changes immediately without duplicate browser entries', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await seedPreferences(page, CONFIGURED_PREFERENCES);
  await page.reload();
  const worker = context.serviceWorkers()[0];
  // Forward to the real browser APIs; record completion because browser chrome
  // menus cannot be inspected through Playwright's page DOM.
  await worker.evaluate(() => {
    globalThis.menuTrace = { ids: [], removals: 0, errors: [] };
    const remove = chrome.contextMenus.removeAll.bind(chrome.contextMenus);
    const create = chrome.contextMenus.create.bind(chrome.contextMenus);
    chrome.contextMenus.removeAll = callback =>
      remove(() => {
        globalThis.menuTrace.ids = [];
        globalThis.menuTrace.removals++;
        callback?.();
      });
    chrome.contextMenus.create = (item, callback) =>
      create(item, () => {
        if (chrome.runtime.lastError)
          globalThis.menuTrace.errors.push(chrome.runtime.lastError.message);
        else globalThis.menuTrace.ids.push(item.id);
        callback?.();
      });
  });

  await page.locator('[data-section="features"]').click();
  for (const cycle of [1, 2]) {
    await page.locator('#contextMenus').uncheck();
    await expect
      .poll(() => worker.evaluate(() => globalThis.menuTrace.removals))
      .toBe(cycle * 2 - 1);
    expect(await worker.evaluate(() => globalThis.menuTrace.ids)).toEqual([]);
    await page.locator('#contextMenus').check();
    await expect
      .poll(() => worker.evaluate(() => globalThis.menuTrace.ids.length))
      .toBe(7);
  }
  const trace = await worker.evaluate(() => globalThis.menuTrace);
  expect(new Set(trace.ids).size).toBe(7);
  expect(trace.errors).toEqual([]);
  await page.locator('#notifications').uncheck();
  await page.reload();
  await page.locator('[data-section="features"]').click();
  await expect(page.locator('#notifications')).not.toBeChecked();
});
