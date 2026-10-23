import {
  test,
  expect,
  CONFIGURED_PREFERENCES,
  seedPreferences,
  FIXTURE_URL,
  activeTabId,
} from './fixtures.js';

test('reading controls work by keyboard and fit compact and wide layouts', async ({
  context,
  extensionId,
}, testInfo) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html?workspace=1`);
  await seedPreferences(page, CONFIGURED_PREFERENCES);
  await page.reload();
  await page.locator('#document-file').setInputFiles({
    name: 'Reading-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Photosynthesis converts sunlight into chemical energy. Plants store this energy in sugars.'
    ),
  });
  await expect(page.locator('#current-page-status')).toContainText('Ready');
  const short = page.getByRole('radio', { name: 'Short', exact: true });
  await short.focus();
  await expect(short).toBeFocused();
  await short.press('ArrowRight');
  await expect(
    page.getByRole('radio', { name: 'Medium', exact: true })
  ).toBeChecked();
  const summary = page.getByRole('tab', { name: 'Summary', exact: true });
  await summary.focus();
  await summary.press('ArrowRight');
  await expect(
    page.getByRole('tab', { name: 'Chat', exact: true })
  ).toBeFocused();
  await expect(
    page.getByRole('tabpanel', { name: 'Chat', exact: true })
  ).toBeVisible();
  await expect(page.locator('#send-chat-btn')).toBeInViewport();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('tabpanel', { name: 'Chat', exact: true })
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#clear-chat-btn')).toBeFocused();
  await page.locator('#theme-toggle').click();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: testInfo.outputPath('workspace-dark.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.locator('#theme-toggle').click();
  await summary.click();
  await page.screenshot({
    path: testInfo.outputPath('workspace-light.png'),
    fullPage: true,
    animations: 'disabled',
  });
  for (const width of [768, 400, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.locator('#current-page-title')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    for (const name of ['Chat', 'Translate', 'Analyze', 'Tools', 'Summary']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(
        page.getByRole('tabpanel', { name, exact: true })
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    }
    await page.screenshot({
      path: testInfo.outputPath(`workspace-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
  const source = await context.newPage();
  await source.goto(FIXTURE_URL);
  await source.bringToFront();
  const tabId = await activeTabId(page);
  await page.goto(
    `chrome-extension://${extensionId}/popup.html?tabId=${tabId}`
  );
  await page.setViewportSize({ width: 400, height: 600 });
  await expect(page.locator('#loading-overlay')).toBeHidden();
  await expect(page.locator('#current-page-title')).toHaveText(
    'Understanding Service Workers'
  );
  await page.screenshot({
    path: testInfo.outputPath('popup.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
