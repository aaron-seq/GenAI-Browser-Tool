import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PopupInterface } from '../../scripts/popup-main.js';

/**
 * Unit coverage for the popup controller.
 *
 * Only the pure helpers were tested before, leaving the controller itself — the
 * part that decides whether a page is readable and what the user is told —
 * uncovered. That includes the `activeTab` path Playwright cannot reach,
 * because Chrome grants that permission only on a real toolbar-icon click.
 *
 * What is testable here is our half of that contract: how the controller
 * behaves when `tab.url` is present, and when it is not because the permission
 * was never granted. The grant itself is Chrome's behaviour, not ours.
 */

/** Minimal DOM carrying the ids the controller touches. */
const FIXTURE = `
  <span id="current-page-title"></span>
  <div id="page-info"></div>
  <span id="provider-indicator"></span>
  <span id="provider-name"></span>

  <select id="summary-type"><option value="key-points">k</option><option value="tldr">t</option></select>
  <input type="radio" name="summary-length" value="short">
  <input type="radio" name="summary-length" value="medium">
  <input type="radio" name="summary-length" value="long">
  <button id="generate-summary-btn"></button>
  <div id="summary-results" style="display:none">
    <div id="summary-content"></div>
    <span id="summary-provider"></span>
    <span id="summary-confidence"></span>
  </div>

  <div id="chat-history"></div>
  <textarea id="chat-input"></textarea>

  <select id="source-language"><option value="auto">auto</option><option value="French">fr</option></select>
  <select id="target-language"><option value="en">en</option><option value="de">de</option></select>
  <input type="checkbox" id="translate-page" checked>
  <div id="translation-results" style="display:none">
    <div id="translation-content"></div>
    <span id="detected-language"></span>
    <span id="translation-confidence"></span>
  </div>

  <div id="sentiment-result"></div>
  <div id="tags-result"></div>
  <div id="readability-result"></div>

  <button id="theme-toggle"></button>
  <div id="toast-container"></div>
  <div id="loading-overlay" style="display:none"><span id="loading-text"></span></div>
`;

/**
 * Build a controller with its constructor-time initialize() already settled.
 *
 * @param {{ tab?: any, responses?: Record<string, any> }} [options]
 */
async function createPopup({ tab, responses = {} } = {}) {
  document.body.innerHTML = FIXTURE;
  document.body.className = '';

  chrome.tabs.query.mockResolvedValue(tab ? [tab] : []);
  chrome.runtime.sendMessage.mockImplementation(async (/** @type {any} */ message) => {
    if (message.actionType in responses) return responses[message.actionType];
    return { success: false, error: 'not stubbed' };
  });

  const popup = new PopupInterface();
  // Let the constructor's async initialize() run to completion.
  await vi.waitFor(() => expect(chrome.tabs.query).toHaveBeenCalled());
  await Promise.resolve();
  return popup;
}

const HTTP_TAB = { id: 7, url: 'https://example.com/article', title: 'An Article' };

const PAGE_CONTENT = {
  success: true,
  data: {
    title: 'An Article',
    url: 'https://example.com/article',
    mainText: 'The article body has several words in it.',
    headings: [{ level: 1, text: 'An Article' }],
    language: 'en'
  }
};

/** @param {string} id */
const text = id => document.getElementById(id)?.textContent ?? '';

describe('PopupInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.tabs.query.mockResolvedValue([]);
    chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'not stubbed' });
  });

  describe('deciding whether a page can be read', () => {
    it('reads a normal http page', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });

      expect(popup.pageContent.mainText).toContain('The article body');
      expect(text('current-page-title')).toBe('An Article');
      // Word count, not character count.
      expect(document.getElementById('page-info')?.title).toContain('8 words');
    });

    it('refuses a chrome:// page without calling the background', async () => {
      await createPopup({ tab: { id: 1, url: 'chrome://extensions', title: 'Extensions' } });

      expect(text('current-page-title')).toMatch(/cannot be read/i);
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'EXTRACT_PAGE_CONTENT' })
      );
    });

    it('treats a tab with no readable url as unreadable', async () => {
      // This is what the popup sees when activeTab was never granted: the tab
      // object exists and has an id, but `url` is withheld by Chrome. Playwright
      // cannot produce the granted case, so this pins the ungranted one.
      await createPopup({ tab: { id: 3 } });

      expect(text('current-page-title')).toMatch(/cannot be read/i);
    });

    it('handles there being no active tab at all', async () => {
      await createPopup({ tab: undefined });
      expect(text('current-page-title')).toMatch(/cannot be read/i);
    });

    it('surfaces a background extraction failure verbatim', async () => {
      await createPopup({
        tab: HTTP_TAB,
        responses: {
          EXTRACT_PAGE_CONTENT: {
            success: false,
            error: 'Cannot read this page (Receiving end does not exist).'
          }
        }
      });

      expect(document.getElementById('page-info')?.title).toContain('Receiving end does not exist');
    });
  });

  describe('applying saved preferences', () => {
    it('seeds the controls from stored settings', async () => {
      await createPopup({
        tab: HTTP_TAB,
        responses: {
          GET_USER_PREFERENCES: {
            success: true,
            data: {
              summaryType: 'tldr',
              summaryLength: 'long',
              targetLanguage: 'de',
              theme: 'dark',
              features: {}
            }
          },
          EXTRACT_PAGE_CONTENT: PAGE_CONTENT
        }
      });

      expect(/** @type {HTMLSelectElement} */ (document.getElementById('summary-type')).value)
        .toBe('tldr');
      expect(/** @type {HTMLSelectElement} */ (document.getElementById('target-language')).value)
        .toBe('de');
      expect(
        /** @type {HTMLInputElement} */ (
          document.querySelector('input[name="summary-length"][value="long"]')
        ).checked
      ).toBe(true);
      expect(document.body.classList.contains('dark-theme')).toBe(true);
    });

    it('leaves defaults alone when preferences cannot be read', async () => {
      await createPopup({ tab: HTTP_TAB });

      expect(document.body.classList.contains('dark-theme')).toBe(false);
    });

    it('persists a theme toggle instead of losing it on close', async () => {
      const popup = await createPopup({ tab: HTTP_TAB });
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, data: {} });

      await popup.toggleTheme();

      expect(document.body.classList.contains('dark-theme')).toBe(true);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'UPDATE_USER_PREFERENCES',
          payload: { theme: 'dark' }
        })
      );
    });
  });

  describe('provider status', () => {
    it('warns when the selected provider has no key', async () => {
      await createPopup({
        tab: HTTP_TAB,
        responses: {
          GET_PROVIDER_STATUS: { success: true, data: { provider: 'anthropic', configured: false } }
        }
      });

      expect(text('provider-name')).toMatch(/no API key/i);
      expect(document.getElementById('toast-container')?.textContent)
        .toMatch(/Add an API key/i);
    });

    it('shows the provider as ready when a key is set', async () => {
      await createPopup({
        tab: HTTP_TAB,
        responses: {
          GET_PROVIDER_STATUS: { success: true, data: { provider: 'openai', configured: true } }
        }
      });

      expect(text('provider-name')).toBe('openai');
      expect(document.getElementById('provider-indicator')?.classList.contains('active')).toBe(true);
    });
  });

  describe('summarizing', () => {
    it('refuses to summarize with no page content', async () => {
      const popup = await createPopup({ tab: undefined });

      await popup.generateSummary();

      expect(document.getElementById('toast-container')?.textContent)
        .toMatch(/No readable page content/i);
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'GENERATE_CONTENT_SUMMARY' })
      );
    });

    it('renders the summary with provider and coverage', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });

      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: {
          summary: '- first point',
          provider: 'anthropic',
          model: 'claude-opus-5',
          sections: 3,
          droppedChars: 0
        }
      });

      await popup.generateSummary();

      expect(document.getElementById('summary-content')?.innerHTML).toContain('first point');
      expect(text('summary-provider')).toBe('anthropic · claude-opus-5');
      expect(text('summary-confidence')).toContain('3 sections');
      expect(document.getElementById('summary-results')?.style.display).toBe('block');
    });

    it('reports a failed summary as a toast rather than blank output', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });
      chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'rate limit exceeded' });

      await popup.generateSummary();

      expect(document.getElementById('toast-container')?.textContent)
        .toContain('rate limit exceeded');
      expect(document.getElementById('summary-content')?.innerHTML).toBe('');
    });
  });

  describe('chat', () => {
    it('notes once that a long page is answered from part of it', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: { answer: 'An answer.', truncated: true }
      });

      const input = /** @type {HTMLTextAreaElement} */ (document.getElementById('chat-input'));

      input.value = 'First question?';
      await popup.sendChatMessage();
      input.value = 'Second question?';
      await popup.sendChatMessage();

      const notices = document.getElementById('chat-history')?.textContent?.match(/only its first section/g);
      expect(notices).toHaveLength(1);
    });

    it('says nothing extra when the whole page fit', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: { answer: 'An answer.', truncated: false }
      });

      /** @type {HTMLTextAreaElement} */ (document.getElementById('chat-input')).value = 'Q?';
      await popup.sendChatMessage();

      expect(document.getElementById('chat-history')?.textContent)
        .not.toMatch(/only its first section/);
    });

    it('ignores an empty question', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });
      vi.clearAllMocks();

      /** @type {HTMLTextAreaElement} */ (document.getElementById('chat-input')).value = '   ';
      await popup.sendChatMessage();

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('shows the error in the thread when an answer fails', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });
      chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'provider down' });

      /** @type {HTMLTextAreaElement} */ (document.getElementById('chat-input')).value = 'Q?';
      await popup.sendChatMessage();

      expect(document.getElementById('chat-history')?.textContent).toContain('provider down');
    });
  });

  describe('translation', () => {
    it('sends the chosen source and target languages', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });

      /** @type {HTMLSelectElement} */ (document.getElementById('source-language')).value = 'French';
      /** @type {HTMLSelectElement} */ (document.getElementById('target-language')).value = 'de';
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: { text: 'Übersetzung', provider: 'openai', model: 'gpt-4o-mini' }
      });

      await popup.translateContent();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'TRANSLATE_CONTENT',
          payload: expect.objectContaining({ sourceLanguage: 'French', targetLanguage: 'de' })
        })
      );
      expect(document.getElementById('translation-content')?.innerHTML).toContain('Übersetzung');
    });
  });

  describe('analysis', () => {
    it('computes readability locally without an API call', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });
      vi.clearAllMocks();

      await popup.runAnalysis('readability');

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(text('readability-result')).toMatch(/Flesch reading ease/);
    });

    it('renders parsed sentiment fields', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: { sentiment: 'positive', reason: 'upbeat tone' }
      });

      await popup.runAnalysis('sentiment');

      expect(text('sentiment-result')).toBe('positive — upbeat tone');
    });

    it('joins tags into a readable list', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });
      chrome.runtime.sendMessage.mockResolvedValue({
        success: true,
        data: { tags: ['ai', 'browsers'] }
      });

      await popup.runAnalysis('tags');

      expect(text('tags-result')).toBe('ai, browsers');
    });

    it('shows the error in the card when analysis fails', async () => {
      const popup = await createPopup({
        tab: HTTP_TAB,
        responses: { EXTRACT_PAGE_CONTENT: PAGE_CONTENT }
      });
      chrome.runtime.sendMessage.mockResolvedValue({ success: false, error: 'no key' });

      await popup.runAnalysis('sentiment');

      expect(text('sentiment-result')).toContain('no key');
    });
  });
});
