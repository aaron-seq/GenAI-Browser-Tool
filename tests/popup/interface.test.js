import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The popup controller, driven through the markup the extension actually ships.
 *
 * `popup.html` is loaded from disk rather than reproduced here on purpose: the
 * controller reaches for roughly forty element ids, and a hand-written fixture
 * would keep passing after a rename in the real page. Loading the shipped file
 * makes a broken id a failing test.
 */

// `import.meta.url` is an http URL under the jsdom environment, so resolve from
// the project root Vitest runs in instead.
const POPUP_BODY = readFileSync(resolve(process.cwd(), 'popup.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/)[1]
  .replace(/<script[\s\S]*?<\/script>/g, '');

const PAGE = {
  title: 'An Article',
  url: 'https://example.com/article',
  mainText: 'The article body. It has several words in it.',
  headings: [{ level: 1, text: 'An Article' }],
  language: 'en'
};

/** Canned responses keyed by actionType, for the mocked message channel. */
let responses;

/** @param {string} id */
const el = id => document.getElementById(id);

/** @param {string} id */
const text = id => el(id)?.textContent ?? '';

/** The most recent payload sent for an action. */
function sentPayload(actionType) {
  const call = chrome.runtime.sendMessage.mock.calls
    .map(([message]) => message)
    .findLast(message => message.actionType === actionType);
  return call?.payload;
}

/** Load the popup with the given preference and page state. */
async function openPopup({ preferences = {}, providerStatus = {}, overrides = {} } = {}) {
  responses = {
    GET_USER_PREFERENCES: {
      success: true,
      data: {
        summaryType: 'key-points',
        summaryLength: 'medium',
        targetLanguage: 'en',
        theme: 'light',
        ...preferences
      }
    },
    GET_PROVIDER_STATUS: {
      success: true,
      data: { provider: 'anthropic', configured: true, ...providerStatus }
    },
    EXTRACT_PAGE_CONTENT: { success: true, data: PAGE },
    ...overrides
  };

  chrome.runtime.sendMessage.mockImplementation(async ({ actionType }) =>
    responses[actionType] ?? { success: false, error: `no stub for ${actionType}` }
  );
  chrome.tabs.query.mockResolvedValue([
    { id: 7, url: 'https://example.com/article', title: 'An Article' }
  ]);

  document.body.className = '';
  document.body.innerHTML = POPUP_BODY;

  vi.resetModules();
  await import('../../scripts/popup-main.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));

  await vi.waitFor(() => expect(el('loading-overlay').style.display).toBe('none'));
}

describe('popup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startup', () => {
    it('reads the current page and reports its length', async () => {
      await openPopup();

      expect(sentPayload('EXTRACT_PAGE_CONTENT')).toEqual({ tabId: 7 });
      expect(text('current-page-title')).toBe('An Article');
      expect(el('page-info').title).toMatch(/\d+ words/);
    });

    // Extensions cannot read chrome:// or Web Store pages. Saying so beats a
    // silent popup that looks like it is still loading.
    it('explains a page it is not allowed to read', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 7, url: 'chrome://extensions' }]);
      chrome.runtime.sendMessage.mockResolvedValue({ success: true, data: {} });

      document.body.innerHTML = POPUP_BODY;
      vi.resetModules();
      await import('../../scripts/popup-main.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));

      await vi.waitFor(() => expect(text('current-page-title')).toMatch(/cannot be read/i));
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'EXTRACT_PAGE_CONTENT' })
      );
    });

    it('surfaces an extraction failure in the header', async () => {
      await openPopup({
        overrides: {
          EXTRACT_PAGE_CONTENT: { success: false, error: 'Cannot read this page (no receiver)' }
        }
      });

      expect(el('page-info').title).toMatch(/no receiver/);
    });
  });

  describe('provider status', () => {
    it('marks a configured provider active', async () => {
      await openPopup();

      expect(text('provider-name')).toBe('anthropic');
      expect(el('provider-indicator').classList.contains('active')).toBe(true);
    });

    // Without this the first AI action fails with an error the user has no way
    // to anticipate.
    it('warns up front when no key is configured', async () => {
      await openPopup({ providerStatus: { configured: false } });

      expect(text('provider-name')).toMatch(/no API key/);
      expect(el('provider-indicator').classList.contains('active')).toBe(false);
      expect(el('toast-container').textContent).toMatch(/Add an API key/);
    });
  });

  describe('saved preferences', () => {
    // Regression for 5.1.0: these were stored by the options page but never
    // applied, so changing a setting appeared to do nothing.
    it('seeds the controls from stored settings', async () => {
      await openPopup({
        preferences: {
          summaryType: 'tldr',
          summaryLength: 'long',
          targetLanguage: 'fr',
          theme: 'dark'
        }
      });

      expect(el('summary-type').value).toBe('tldr');
      expect(el('target-language').value).toBe('fr');
      expect(document.querySelector('input[name="summary-length"]:checked').value).toBe('long');
      expect(document.body.classList.contains('dark-theme')).toBe(true);
    });

    it('persists a theme toggle rather than losing it on close', async () => {
      await openPopup();

      el('theme-toggle').click();

      await vi.waitFor(() => {
        expect(sentPayload('UPDATE_USER_PREFERENCES')).toEqual({ theme: 'dark' });
      });
      expect(document.body.classList.contains('dark-theme')).toBe(true);
    });
  });

  describe('summary', () => {
    const SUMMARY = {
      success: true,
      data: {
        summary: '- point one\n- point two',
        provider: 'anthropic',
        model: 'claude-opus-5',
        sections: 3,
        droppedChars: 0
      }
    };

    // `popup.html` ships with the "short" radio marked `checked`. The stored
    // preference has to win over that, or the options page's length setting is
    // silently ignored for every first summary.
    it('sends the selected style and the saved length, not the markup default', async () => {
      await openPopup({
        preferences: { summaryLength: 'medium' },
        overrides: { GENERATE_CONTENT_SUMMARY: SUMMARY }
      });
      el('summary-type').value = 'executive';

      el('generate-summary-btn').click();

      await vi.waitFor(() => expect(sentPayload('GENERATE_CONTENT_SUMMARY')).toBeTruthy());
      expect(sentPayload('GENERATE_CONTENT_SUMMARY')).toMatchObject({
        content: PAGE.mainText,
        summaryType: 'executive',
        targetLength: 'medium'
      });
    });

    it('renders the summary with its provider and coverage', async () => {
      await openPopup({ overrides: { GENERATE_CONTENT_SUMMARY: SUMMARY } });

      el('generate-summary-btn').click();

      await vi.waitFor(() => expect(el('summary-results').style.display).toBe('block'));
      expect(el('summary-content').innerHTML).toContain('<li>point one</li>');
      expect(text('summary-provider')).toBe('anthropic · claude-opus-5');
      expect(text('summary-confidence')).toBe('Whole page, summarized across 3 sections');
    });

    // A page whose tail was dropped must not read as a complete summary.
    it('states plainly when part of the page was left out', async () => {
      await openPopup({
        overrides: {
          GENERATE_CONTENT_SUMMARY: {
            success: true,
            data: { ...SUMMARY.data, sections: 8, droppedChars: 51000 }
          }
        }
      });

      el('generate-summary-btn').click();

      await vi.waitFor(() => expect(text('summary-confidence')).toMatch(/not included/));
      expect(text('summary-confidence')).toContain('51,000');
    });

    it('shows the provider error instead of an empty result', async () => {
      await openPopup({
        overrides: {
          GENERATE_CONTENT_SUMMARY: { success: false, error: 'Anthropic returned 401: bad key' }
        }
      });

      el('generate-summary-btn').click();

      await vi.waitFor(() => {
        expect(el('toast-container').textContent).toMatch(/returned 401/);
      });
      expect(el('summary-results').style.display).not.toBe('block');
    });

    it('refuses to export before a summary exists', async () => {
      await openPopup();

      el('export-summary-btn').click();

      expect(el('toast-container').textContent).toMatch(/Generate a summary first/);
    });

    it('does nothing when the page could not be read', async () => {
      await openPopup({
        overrides: { EXTRACT_PAGE_CONTENT: { success: false, error: 'blocked' } }
      });
      chrome.runtime.sendMessage.mockClear();

      el('generate-summary-btn').click();

      expect(el('toast-container').textContent).toMatch(/No readable page content/);
      expect(sentPayload('GENERATE_CONTENT_SUMMARY')).toBeUndefined();
    });
  });

  describe('chat', () => {
    const ANSWER = { success: true, data: { answer: 'It is about extensions.', truncated: false } };

    it('sends the question with the page as context and renders the answer', async () => {
      await openPopup({ overrides: { ANSWER_CONTEXTUAL_QUESTION: ANSWER } });
      el('chat-input').value = 'What is this about?';

      el('send-chat-btn').click();

      await vi.waitFor(() => {
        expect(el('chat-history').textContent).toContain('It is about extensions.');
      });
      expect(sentPayload('ANSWER_CONTEXTUAL_QUESTION')).toMatchObject({
        question: 'What is this about?',
        context: PAGE.mainText
      });
      expect(el('chat-input').value).toBe('');
    });

    it('ignores an empty question', async () => {
      await openPopup({ overrides: { ANSWER_CONTEXTUAL_QUESTION: ANSWER } });
      el('chat-input').value = '   ';

      el('send-chat-btn').click();

      expect(sentPayload('ANSWER_CONTEXTUAL_QUESTION')).toBeUndefined();
    });

    // Chat is a single request, so a long page is answered from its first
    // section. Saying so once stops the answer looking exhaustive.
    it('notes a long page once, not on every turn', async () => {
      await openPopup({
        overrides: {
          ANSWER_CONTEXTUAL_QUESTION: {
            success: true,
            data: { answer: 'Partial answer.', truncated: true }
          }
        }
      });

      for (const question of ['first?', 'second?']) {
        el('chat-input').value = question;
        el('send-chat-btn').click();
        await vi.waitFor(() =>
          expect(el('chat-history').textContent).toContain('Partial answer.')
        );
      }

      const notes = el('chat-history').textContent.match(/only its first section/g) || [];
      expect(notes).toHaveLength(1);
    });

    it('puts a failure in the thread rather than losing it', async () => {
      await openPopup({
        overrides: { ANSWER_CONTEXTUAL_QUESTION: { success: false, error: 'rate limited' } }
      });
      el('chat-input').value = 'anything?';

      el('send-chat-btn').click();

      await vi.waitFor(() => expect(el('chat-history').textContent).toContain('rate limited'));
    });

    it('sends on Enter but not on Shift+Enter', async () => {
      await openPopup({ overrides: { ANSWER_CONTEXTUAL_QUESTION: ANSWER } });

      el('chat-input').value = 'newline please';
      el('chat-input').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
      );
      expect(sentPayload('ANSWER_CONTEXTUAL_QUESTION')).toBeUndefined();

      el('chat-input').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );
      await vi.waitFor(() => expect(sentPayload('ANSWER_CONTEXTUAL_QUESTION')).toBeTruthy());
    });
  });

  describe('translation', () => {
    const TRANSLATION = {
      success: true,
      data: { text: 'Le corps de l\'article.', provider: 'anthropic', model: 'claude-opus-5' }
    };

    it('sends the whole page when the checkbox is ticked', async () => {
      await openPopup({ overrides: { TRANSLATE_CONTENT: TRANSLATION } });
      el('translate-page').checked = true;
      el('target-language').value = 'fr';

      el('translate-btn').click();

      await vi.waitFor(() => expect(sentPayload('TRANSLATE_CONTENT')).toBeTruthy());
      expect(sentPayload('TRANSLATE_CONTENT')).toMatchObject({
        text: PAGE.mainText,
        targetLanguage: 'fr'
      });
    });

    it('sends only an excerpt when it is not', async () => {
      await openPopup({ overrides: { TRANSLATE_CONTENT: TRANSLATION } });
      el('translate-page').checked = false;

      el('translate-btn').click();

      await vi.waitFor(() => expect(sentPayload('TRANSLATE_CONTENT')).toBeTruthy());
      expect(sentPayload('TRANSLATE_CONTENT').text.length).toBeLessThanOrEqual(2000);
    });

    it('swaps the language selectors, unless the source is auto-detect', async () => {
      await openPopup();
      el('source-language').value = 'auto';
      el('target-language').value = 'fr';

      el('swap-languages').click();
      expect(el('target-language').value).toBe('fr');

      el('source-language').value = 'en';
      el('swap-languages').click();
      expect(el('source-language').value).toBe('fr');
      expect(el('target-language').value).toBe('en');
    });
  });

  describe('analysis', () => {
    it('computes readability locally without spending a request', async () => {
      await openPopup();
      chrome.runtime.sendMessage.mockClear();

      document.querySelector('.analyze-btn[data-type="readability"]').click();

      await vi.waitFor(() => expect(text('readability-result')).toMatch(/Flesch reading ease/));
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('renders a parsed sentiment', async () => {
      await openPopup({
        overrides: {
          ANALYZE_SENTIMENT: {
            success: true,
            data: { sentiment: 'positive', reason: 'upbeat tone' }
          }
        }
      });

      document.querySelector('.analyze-btn[data-type="sentiment"]').click();

      await vi.waitFor(() => expect(text('sentiment-result')).toBe('positive — upbeat tone'));
    });

    it('renders tags as a list', async () => {
      await openPopup({
        overrides: {
          GENERATE_SMART_TAGS: { success: true, data: { tags: ['browsers', 'ai'] } }
        }
      });

      document.querySelector('.analyze-btn[data-type="tags"]').click();

      await vi.waitFor(() => expect(text('tags-result')).toBe('browsers, ai'));
    });

    it('puts an analysis failure in the panel it belongs to', async () => {
      await openPopup({
        overrides: { EXTRACT_KEY_INSIGHTS: { success: false, error: 'provider unreachable' } }
      });

      document.querySelector('.analyze-btn[data-type="insights"]').click();

      await vi.waitFor(() => expect(text('insights-result')).toBe('provider unreachable'));
    });
  });

  describe('tools', () => {
    it('reports page statistics computed locally', async () => {
      await openPopup();

      el('page-stats-btn').click();

      expect(el('tools-results').style.display).toBe('block');
      expect(el('tools-results-content').textContent).toMatch(/words/);
      expect(el('tools-results-content').textContent).toMatch(/min read/);
    });

    it('lists links read straight from the page', async () => {
      await openPopup();
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        data: [{ text: 'Docs', href: 'https://example.com/docs' }]
      });

      el('extract-links-btn').click();

      await vi.waitFor(() =>
        expect(el('tools-results-content').textContent).toContain('example.com/docs')
      );
    });

    // Link text comes from the page, so it is untrusted and must not be markup.
    it('escapes link text taken from the page', async () => {
      await openPopup();
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        data: [{ text: '<img src=x onerror=alert(1)>', href: 'https://example.com' }]
      });

      el('extract-links-btn').click();

      await vi.waitFor(() => expect(el('tools-results-content').innerHTML).toContain('&lt;img'));
      expect(el('tools-results-content').querySelector('img')).toBeNull();
    });

    it('closes the results panel', async () => {
      await openPopup();
      el('page-stats-btn').click();

      el('close-tools-results').click();

      expect(el('tools-results').style.display).toBe('none');
    });

    it('reports an export failure instead of a success toast', async () => {
      await openPopup({
        overrides: { EXPORT_USER_DATA: { success: false, error: 'storage unavailable' } }
      });

      el('export-data-btn').click();

      await vi.waitFor(() =>
        expect(el('toast-container').textContent).toMatch(/storage unavailable/)
      );
    });
  });

  describe('tabs', () => {
    it('activates the pane for the clicked tab', async () => {
      await openPopup();

      document.querySelector('.tab-button[data-tab="analyze"]').click();

      expect(el('analyze-tab').classList.contains('active')).toBe(true);
      expect(el('summary-tab').classList.contains('active')).toBe(false);
    });
  });

  describe('the message channel itself failing', () => {
    it('reports a dead service worker rather than hanging', async () => {
      chrome.tabs.query.mockResolvedValue([{ id: 7, url: 'https://example.com' }]);
      chrome.runtime.sendMessage.mockRejectedValue(
        new Error('Could not establish connection')
      );

      document.body.innerHTML = POPUP_BODY;
      vi.resetModules();
      await import('../../scripts/popup-main.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));

      await vi.waitFor(() => expect(text('provider-name')).toBe('Service unavailable'));
    });
  });
});
