import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OptionsPage } from '../../options.js';

/**
 * Unit coverage for the settings form.
 *
 * The e2e suite proves one key round-trips through real Chrome storage. These
 * cover the rest of the form: model overrides, feature toggles, provider
 * selection, reset, and the section navigation.
 */

const FIXTURE = `
  <button class="nav-item active" data-section="ai-providers"></button>
  <button class="nav-item" data-section="features"></button>
  <section class="settings-section active" id="ai-providers-section"></section>
  <section class="settings-section" id="features-section"></section>

  <input type="radio" name="primary-provider" value="anthropic">
  <input type="radio" name="primary-provider" value="openai">
  <input type="radio" name="primary-provider" value="gemini">

  <input type="password" id="anthropic-key">
  <input type="password" id="openai-key">
  <input type="password" id="gemini-key">
  <input type="text" id="anthropic-model">
  <input type="text" id="openai-model">
  <input type="text" id="gemini-model">

  <select id="summary-type-pref"><option value="key-points">k</option><option value="tldr">t</option></select>
  <select id="summary-length-pref"><option value="medium">m</option><option value="long">l</option></select>
  <input type="checkbox" id="contextMenus">
  <input type="checkbox" id="notifications">
  <input type="checkbox" id="saveHistory">

  <button id="reset-settings"></button>
  <div id="save-indicator"><span class="text"></span></div>
`;

/** @param {any} stored */
async function createPage(stored) {
  document.body.innerHTML = FIXTURE;
  chrome.storage.sync.get.mockResolvedValue(stored ? { user_preferences: stored } : {});

  const page = new OptionsPage();
  // initialize() is async and started by the constructor: it awaits storage,
  // then renders, then attaches listeners. Waiting on a rendered outcome is
  // more reliable than counting microtask turns.
  await vi.waitFor(() =>
    expect(document.querySelector('input[name="primary-provider"]:checked')).not.toBeNull()
  );
  return page;
}

/** The preferences object written by the most recent storage.sync.set call. */
function lastWrite() {
  const calls = chrome.storage.sync.set.mock.calls;
  return calls[calls.length - 1][0].user_preferences;
}

/** @param {string} id @param {string} value */
async function change(id, value) {
  const el = /** @type {HTMLInputElement} */ (document.getElementById(id));
  el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());
}

describe('OptionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.sync.set.mockResolvedValue(undefined);
  });

  describe('rendering stored settings', () => {
    it('shows saved keys, models, and toggles', async () => {
      await createPage({
        preferredProvider: 'openai',
        apiKeys: { openai: 'sk-stored', anthropic: 'sk-ant-stored' },
        models: { openai: 'gpt-custom' },
        summaryType: 'tldr',
        summaryLength: 'long',
        features: { contextMenus: false, notifications: true, saveHistory: true }
      });

      expect(/** @type {HTMLInputElement} */ (document.getElementById('openai-key')).value)
        .toBe('sk-stored');
      expect(/** @type {HTMLInputElement} */ (document.getElementById('anthropic-key')).value)
        .toBe('sk-ant-stored');
      expect(/** @type {HTMLInputElement} */ (document.getElementById('openai-model')).value)
        .toBe('gpt-custom');
      expect(
        /** @type {HTMLInputElement} */ (
          document.querySelector('input[name="primary-provider"][value="openai"]')
        ).checked
      ).toBe(true);
      expect(/** @type {HTMLInputElement} */ (document.getElementById('contextMenus')).checked)
        .toBe(false);
      expect(/** @type {HTMLInputElement} */ (document.getElementById('notifications')).checked)
        .toBe(true);
    });

    it('renders defaults with nothing stored, and does not throw', async () => {
      // The v4 page threw a TypeError here because defaults had no `features`.
      await createPage(null);

      expect(
        /** @type {HTMLInputElement} */ (
          document.querySelector('input[name="primary-provider"][value="anthropic"]')
        ).checked
      ).toBe(true);
      expect(/** @type {HTMLInputElement} */ (document.getElementById('anthropic-key')).value)
        .toBe('');
    });

    it('renders a preferences object written by an older version', async () => {
      await createPage({ preferredProvider: 'openai' });

      expect(/** @type {HTMLInputElement} */ (document.getElementById('openai-key')).value).toBe('');
    });
  });

  describe('saving changes', () => {
    it('stores an API key under the provider it belongs to', async () => {
      await createPage(null);
      await change('anthropic-key', 'sk-ant-typed');

      expect(lastWrite().apiKeys.anthropic).toBe('sk-ant-typed');
    });

    it('trims whitespace pasted around a key', async () => {
      await createPage(null);
      await change('openai-key', '  sk-padded  ');

      expect(lastWrite().apiKeys.openai).toBe('sk-padded');
    });

    it('stores a model override separately from the key', async () => {
      await createPage(null);
      await change('gemini-model', 'gemini-custom');

      const written = lastWrite();
      expect(written.models.gemini).toBe('gemini-custom');
      expect(written.apiKeys.gemini).toBeUndefined();
    });

    it('does not clobber another provider key when one changes', async () => {
      await createPage({ apiKeys: { openai: 'sk-existing' } });
      await change('anthropic-key', 'sk-new');

      const written = lastWrite();
      expect(written.apiKeys.openai).toBe('sk-existing');
      expect(written.apiKeys.anthropic).toBe('sk-new');
    });

    it('stores the selected provider', async () => {
      await createPage(null);

      const radio = /** @type {HTMLInputElement} */ (
        document.querySelector('input[name="primary-provider"][value="gemini"]')
      );
      radio.checked = true;
      radio.dispatchEvent(new window.Event('change', { bubbles: true }));
      await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());

      expect(lastWrite().preferredProvider).toBe('gemini');
    });

    it('stores summary preferences', async () => {
      await createPage(null);
      await change('summary-type-pref', 'tldr');

      expect(lastWrite().summaryType).toBe('tldr');
    });

    it('stores a feature toggle by its element id', async () => {
      await createPage(null);

      const checkbox = /** @type {HTMLInputElement} */ (document.getElementById('notifications'));
      checkbox.checked = false;
      checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
      await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());

      expect(lastWrite().features.notifications).toBe(false);
    });

    it('confirms the save in the UI', async () => {
      await createPage(null);
      await change('anthropic-key', 'sk-x');

      expect(document.getElementById('save-indicator')?.classList.contains('visible')).toBe(true);
    });

    it('tells the user when a save fails instead of showing success', async () => {
      await createPage(null);
      chrome.storage.sync.set.mockRejectedValue(new Error('QUOTA_BYTES exceeded'));

      const el = /** @type {HTMLInputElement} */ (document.getElementById('anthropic-key'));
      el.value = 'sk-x';
      el.dispatchEvent(new window.Event('change', { bubbles: true }));

      await vi.waitFor(() =>
        expect(document.querySelector('#save-indicator .text')?.textContent)
          .toMatch(/Could not save/)
      );
    });
  });

  describe('reset', () => {
    // options.js calls bare `confirm(...)`, which resolves on globalThis.
    // tests/setup.js builds its own JSDOM for `window`/`document`, so assigning
    // `window.confirm` would patch a different object than the one under test.
    it('writes defaults when confirmed', async () => {
      const page = await createPage({ apiKeys: { openai: 'sk-existing' } });
      vi.stubGlobal('confirm', vi.fn(() => true));

      await page.resetSettings();

      expect(lastWrite().apiKeys).toEqual({});
      vi.unstubAllGlobals();
    });

    it('does nothing when cancelled', async () => {
      const page = await createPage({ apiKeys: { openai: 'sk-existing' } });
      vi.stubGlobal('confirm', vi.fn(() => false));
      vi.clearAllMocks();

      await page.resetSettings();

      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('section navigation', () => {
    it('moves the active class to the clicked section', async () => {
      await createPage(null);

      const featuresNav = /** @type {HTMLElement} */ (
        document.querySelector('.nav-item[data-section="features"]')
      );
      featuresNav.click();

      expect(featuresNav.classList.contains('active')).toBe(true);
      expect(document.getElementById('features-section')?.classList.contains('active')).toBe(true);
      expect(document.getElementById('ai-providers-section')?.classList.contains('active'))
        .toBe(false);
    });
  });
});
