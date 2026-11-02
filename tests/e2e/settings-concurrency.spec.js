import {
  test,
  expect,
  CONFIGURED_PREFERENCES,
  seedPreferences,
} from './fixtures.js';

/** Hold writes without replacing Chrome's reads or final persistence. */
async function holdWrites(surface) {
  await surface.evaluate(() => {
    const write = chrome.storage.sync.set.bind(chrome.storage.sync);
    let release;
    const gate = new Promise(resolve => {
      release = resolve;
    });
    globalThis.settingsWrites = { started: 0, release };
    chrome.storage.sync.set = async values => {
      globalThis.settingsWrites.started++;
      await gate;
      return write(values);
    };
  });
}

for (const scenario of [
  {
    name: 'top-level and feature edits',
    changes: [
      { id: 'summary-type-pref', value: 'tldr' },
      { id: 'notifications', checked: false },
    ],
    expected: {
      summaryType: 'tldr',
      features: { notifications: false, saveHistory: false },
    },
  },
  {
    name: 'two entries in the same nested map',
    changes: [
      { id: 'anthropic-model', value: 'fixture-anthropic' },
      { id: 'openai-model', value: 'fixture-openai' },
    ],
    expected: {
      models: { anthropic: 'fixture-anthropic', openai: 'fixture-openai' },
    },
  },
]) {
  test(`two extension contexts preserve overlapping ${scenario.name}`, async ({
    context,
    extensionId,
  }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    const url = `chrome-extension://${extensionId}/options.html`;
    await first.goto(url);
    const preferences = {
      ...CONFIGURED_PREFERENCES,
      features: {
        contextMenus: false,
        notifications: true,
        saveHistory: false,
      },
    };
    await seedPreferences(first, preferences);
    await Promise.all([first.reload(), second.goto(url)]);
    for (const page of [first, second]) {
      await expect(page.locator('#anthropic-key')).toHaveValue(
        preferences.apiKeys.anthropic
      );
    }
    const worker = context.serviceWorkers()[0];
    const surfaces = [first, second, worker];
    await Promise.all(surfaces.map(holdWrites));

    try {
      await Promise.all(
        [first, second].map((page, index) =>
          page.evaluate(change => {
            const input = document.getElementById(change.id);
            if ('checked' in change) input.checked = change.checked;
            else input.value = change.value;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }, scenario.changes[index])
        )
      );
      // With legacy page writers, both stale snapshots reach the held writes.
      // With one worker writer, only its first write can enter before release.
      await expect
        .poll(async () => {
          const [pageA, pageB, background] = await Promise.all(
            surfaces.map(surface =>
              surface.evaluate(() => globalThis.settingsWrites.started)
            )
          );
          return background > 0 || pageA + pageB === 2;
        })
        .toBe(true);
    } finally {
      await Promise.all(
        surfaces.map(surface =>
          surface.evaluate(() => globalThis.settingsWrites.release())
        )
      );
    }

    for (const page of [first, second]) {
      await expect(page.locator('#save-indicator .text')).toHaveText(
        'Settings saved'
      );
    }
    const saved = await first.evaluate(
      async () =>
        (await chrome.storage.sync.get('user_preferences')).user_preferences
    );
    expect(saved).toMatchObject(scenario.expected);
    expect(saved.apiKeys).toEqual(preferences.apiKeys);
    const counts = await Promise.all(
      surfaces.map(surface =>
        surface.evaluate(() => globalThis.settingsWrites.started)
      )
    );
    expect(counts).toEqual([0, 0, 2]);
  });
}
