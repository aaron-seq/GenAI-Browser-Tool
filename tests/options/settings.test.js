import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The options page is the only writer of `user_preferences`. What matters is
 * that every control maps to the field the background service later reads —
 * a mismatch here is invisible in the UI and shows up as "changing the setting
 * does nothing", which is exactly the class of bug 5.1.0 had to fix.
 *
 * Driven through the real DOM: build the markup the page ships, import the
 * module, fire `change` events, and assert on what reached storage.
 */

/** The subset of options.html these tests exercise. */
const OPTIONS_MARKUP = `
  <input type="radio" name="primary-provider" value="anthropic" id="p-anthropic">
  <input type="radio" name="primary-provider" value="openai" id="p-openai">
  <input type="radio" name="primary-provider" value="gemini" id="p-gemini">

  <input id="anthropic-key" type="password">
  <input id="openai-key" type="password">
  <input id="gemini-key" type="password">
  <input id="anthropic-model" type="text">
  <input id="openai-model" type="text">
  <input id="gemini-model" type="text">

  <select id="summary-type-pref">
    <option value="key-points">Key points</option>
    <option value="tldr">TL;DR</option>
  </select>
  <select id="summary-length-pref">
    <option value="medium">Medium</option>
    <option value="long">Long</option>
  </select>

  <input id="contextMenus" type="checkbox">
  <input id="notifications" type="checkbox">
  <input id="saveHistory" type="checkbox">

  <button class="nav-item" data-section="ai-providers"></button>
  <button class="nav-item" data-section="privacy"></button>
  <div id="ai-providers-section" class="settings-section"></div>
  <div id="privacy-section" class="settings-section"></div>

  <button id="reset-settings"></button>
  <div id="save-indicator"><span class="text"></span></div>
`;

/** Whatever `chrome.storage.sync.set` was last given, unwrapped. */
function lastSaved() {
  const calls = chrome.storage.sync.set.mock.calls;
  return calls.at(-1)[0].user_preferences;
}

/**
 * @param {string} id
 * @param {string} value
 */
function change(id, value) {
  const el = /** @type {HTMLInputElement} */ (document.getElementById(id));
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** @param {Record<string, any>} stored */
async function loadPage(stored = {}) {
  document.body.innerHTML = OPTIONS_MARKUP;
  chrome.storage.sync.get.mockResolvedValue(
    Object.keys(stored).length ? { user_preferences: stored } : {}
  );

  vi.resetModules();
  await import('../../options.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));

  // The controller reads storage before its first render.
  await vi.waitFor(() => expect(chrome.storage.sync.get).toHaveBeenCalled());
  await Promise.resolve();
}

describe('options page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.storage.sync.set.mockResolvedValue(undefined);
  });

  describe('rendering saved settings', () => {
    it('shows the keys and models already stored', async () => {
      await loadPage({
        preferredProvider: 'openai',
        apiKeys: { openai: 'sk-stored' },
        models: { openai: 'gpt-4o' },
        summaryType: 'tldr',
        summaryLength: 'long',
        features: { contextMenus: false, notifications: true, saveHistory: true }
      });

      await vi.waitFor(() => {
        expect(document.getElementById('openai-key').value).toBe('sk-stored');
      });
      expect(document.getElementById('openai-model').value).toBe('gpt-4o');
      expect(document.getElementById('p-openai').checked).toBe(true);
      expect(document.getElementById('summary-type-pref').value).toBe('tldr');
      expect(document.getElementById('summary-length-pref').value).toBe('long');
      expect(document.getElementById('contextMenus').checked).toBe(false);
      expect(document.getElementById('notifications').checked).toBe(true);
    });

    it('renders defaults on a first run with nothing stored', async () => {
      await loadPage();

      await vi.waitFor(() => {
        expect(document.getElementById('p-anthropic').checked).toBe(true);
      });
      expect(document.getElementById('anthropic-key').value).toBe('');
    });
  });

  describe('saving', () => {
    beforeEach(async () => {
      await loadPage({ preferredProvider: 'anthropic', apiKeys: {}, models: {} });
      chrome.storage.sync.set.mockClear();
    });

    // The field name the background service reads. These four assertions are
    // the contract that 5.0.0 had to repair once already, when the page wrote
    // `user_preferences.apiKeys.openai` and the provider read `openai_api_key`.
    it('stores an API key under apiKeys.<provider>', async () => {
      change('openai-key', 'sk-typed');

      await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());
      expect(lastSaved().apiKeys.openai).toBe('sk-typed');
    });

    it('stores a model override under models.<provider>', async () => {
      change('gemini-model', 'gemini-3-pro');

      await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());
      expect(lastSaved().models.gemini).toBe('gemini-3-pro');
    });

    it('trims whitespace pasted around a key', async () => {
      change('anthropic-key', '  sk-ant-padded  ');

      await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());
      expect(lastSaved().apiKeys.anthropic).toBe('sk-ant-padded');
    });

    it('stores the selected provider', async () => {
      const radio = /** @type {HTMLInputElement} */ (document.getElementById('p-gemini'));
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));

      await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());
      expect(lastSaved().preferredProvider).toBe('gemini');
    });

    it('stores summary style and length under the names the router reads', async () => {
      change('summary-type-pref', 'tldr');
      await vi.waitFor(() => expect(lastSaved().summaryType).toBe('tldr'));

      change('summary-length-pref', 'long');
      await vi.waitFor(() => expect(lastSaved().summaryLength).toBe('long'));
    });

    it('stores a checkbox under features.<id>', async () => {
      const box = /** @type {HTMLInputElement} */ (document.getElementById('notifications'));
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));

      await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());
      expect(lastSaved().features.notifications).toBe(false);
    });

    it('confirms the save in the UI', async () => {
      change('openai-key', 'sk-typed');

      await vi.waitFor(() => {
        expect(document.getElementById('save-indicator').classList.contains('visible')).toBe(true);
      });
      expect(document.querySelector('#save-indicator .text').textContent).toBe('Settings saved');
    });

    // A write that fails and still says "Settings saved" is the worst outcome
    // here: the user closes the page believing their key is stored.
    it('says so when the write fails instead of reporting success', async () => {
      chrome.storage.sync.set.mockRejectedValue(new Error('QUOTA_BYTES exceeded'));

      change('openai-key', 'sk-typed');

      await vi.waitFor(() => {
        const text = document.querySelector('#save-indicator .text').textContent;
        expect(text).toMatch(/Could not save/);
        expect(text).toContain('QUOTA_BYTES exceeded');
      });
    });
  });

  describe('reset', () => {
    beforeEach(async () => {
      await loadPage({ preferredProvider: 'openai', apiKeys: { openai: 'sk-stored' } });
      chrome.storage.sync.set.mockClear();
    });

    it('does nothing when the confirmation is declined', async () => {
      confirm.mockReturnValue(false);

      document.getElementById('reset-settings').click();
      await Promise.resolve();

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    it('clears stored keys once confirmed', async () => {
      confirm.mockReturnValue(true);
      chrome.storage.sync.get.mockResolvedValue({});

      document.getElementById('reset-settings').click();

      await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());
      expect(lastSaved().apiKeys).toEqual({});
      expect(lastSaved().preferredProvider).toBe('anthropic');
    });
  });

  describe('section navigation', () => {
    it('activates the clicked section and deactivates the previous one', async () => {
      await loadPage();

      const [providers, privacy] = document.querySelectorAll('.nav-item');
      providers.click();
      expect(document.getElementById('ai-providers-section').classList.contains('active'))
        .toBe(true);

      privacy.click();
      expect(document.getElementById('privacy-section').classList.contains('active')).toBe(true);
      expect(document.getElementById('ai-providers-section').classList.contains('active'))
        .toBe(false);
    });
  });
});
