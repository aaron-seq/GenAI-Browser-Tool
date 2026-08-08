import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * End-to-end through the background service worker: a message arrives, the
 * configured provider is called over fetch, and a response goes back.
 *
 * The previous version of this suite asserted that summarization *succeeded*
 * with no API key configured — which only passed because every provider
 * returned a hardcoded stub string. These tests assert the real contract.
 */

/** @param {any} body */
function okResponse(body) {
  return { ok: true, status: 200, statusText: 'OK', json: vi.fn().mockResolvedValue(body) };
}

const CLAUDE_REPLY = okResponse({ content: [{ type: 'text', text: '- point one\n- point two' }] });

/** Preferences with a working Anthropic key. */
const CONFIGURED = {
  user_preferences: {
    initialized: true,
    preferredProvider: 'anthropic',
    apiKeys: { anthropic: 'sk-ant-test' },
    models: {},
    features: { contextMenus: true, notifications: true, saveHistory: true },
    summaryType: 'key-points',
    summaryLength: 'medium'
  }
};

/**
 * @param {string} actionType
 * @param {any} payload
 * @returns {Promise<any>}
 */
/**
 * @param {string} actionType
 * @param {any} payload
 * @param {number} [timeout]  Raise when the path under test exhausts retries.
 */
function dispatch(actionType, payload, timeout = 1000) {
  const handler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
  const sendResponse = vi.fn();
  handler({ actionType, requestId: 'req-1', payload }, { id: 'mock-extension-id' }, sendResponse);
  return vi.waitFor(
    () => {
      expect(sendResponse).toHaveBeenCalled();
      return sendResponse.mock.calls[0][0];
    },
    { timeout }
  );
}

describe('Extension workflow', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    chrome.storage.sync.get.mockResolvedValue(CONFIGURED);
    chrome.storage.local.get.mockResolvedValue({});

    await import('../../background.js');
    await vi.waitFor(() => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });
  });

  describe('summarization', () => {
    it('calls the configured provider and returns its text', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);

      const response = await dispatch('GENERATE_CONTENT_SUMMARY', {
        content: 'A long article about browser extensions.',
        summaryType: 'key-points',
        targetLength: 'medium'
      });

      expect(response.success).toBe(true);
      expect(response.data.summary).toBe('- point one\n- point two');
      expect(response.data.provider).toBe('anthropic');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('persists the summary to local history', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);

      await dispatch('GENERATE_CONTENT_SUMMARY', { content: 'article text' });

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          genai_summary_history: expect.arrayContaining([
            expect.objectContaining({ provider: 'anthropic' })
          ])
        })
      );
    });

    it('summarizes a long page as sections plus one merge, not a truncation', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);

      // Three chunks' worth of paragraphs.
      const longPage = Array.from({ length: 80 }, (_, i) =>
        `Paragraph ${i}. ${'word '.repeat(180)}`
      ).join('\n\n');

      const response = await dispatch('GENERATE_CONTENT_SUMMARY', {
        content: longPage,
        summaryType: 'key-points'
      });

      expect(response.success).toBe(true);
      expect(response.data.sections).toBeGreaterThan(1);
      expect(response.data.droppedChars).toBe(0);
      expect(response.data.truncated).toBe(false);

      // One request per section, plus a final merge.
      expect(global.fetch).toHaveBeenCalledTimes(response.data.sections + 1);

      const bodies = global.fetch.mock.calls.map(call => JSON.parse(call[1].body));
      const mapCalls = bodies.filter(b => b.system.includes('You are reading section'));
      const reduceCalls = bodies.filter(b => b.system.includes('You are given ordered notes'));
      expect(mapCalls).toHaveLength(response.data.sections);
      expect(reduceCalls).toHaveLength(1);

      // The merge step reads our own notes, so it is not fenced as untrusted.
      expect(reduceCalls[0].messages[0].content).not.toContain('<<<PAGE_CONTENT>>>');
    });

    it('still issues exactly one call for a page that fits', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);

      const response = await dispatch('GENERATE_CONTENT_SUMMARY', { content: 'A short article.' });

      expect(response.data.sections).toBe(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('rejects empty content before spending an API call', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);

      const response = await dispatch('GENERATE_CONTENT_SUMMARY', { content: '   ' });

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('NO_CONTENT');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('tells the user to configure a key instead of inventing a summary', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: { initialized: true, preferredProvider: 'anthropic', apiKeys: {} }
      });

      const response = await dispatch('GENERATE_CONTENT_SUMMARY', { content: 'article text' });

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('MISSING_API_KEY');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('retries a rate limit, then surfaces it rather than a fake answer', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: { get: () => null },
        json: vi.fn().mockResolvedValue({ error: { message: 'rate limit exceeded' } })
      });

      const response = await dispatch(
        'GENERATE_CONTENT_SUMMARY',
        { content: 'article text' },
        10000
      );

      expect(response.success).toBe(false);
      expect(response.error).toContain('rate limit exceeded');
      // Retried before giving up, rather than failing on the first 429.
      expect(global.fetch.mock.calls.length).toBeGreaterThan(1);
    });

    it('recovers from a transient rate limit without the user seeing it', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: { get: () => null },
          json: vi.fn().mockResolvedValue({ error: { message: 'slow down' } })
        })
        .mockResolvedValue(CLAUDE_REPLY);

      const response = await dispatch(
        'GENERATE_CONTENT_SUMMARY',
        { content: 'article text' },
        10000
      );

      expect(response.success).toBe(true);
      expect(response.data.summary).toBe('- point one\n- point two');
    });
  });

  describe('page content extraction', () => {
    it('uses the tab id the popup supplies, since popup messages carry no sender.tab', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({ success: true, data: { mainText: 'page text' } });

      const response = await dispatch('EXTRACT_PAGE_CONTENT', { tabId: 42 });

      expect(response.success).toBe(true);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, { action: 'extractContent' });
    });

    it('explains why restricted pages cannot be read', async () => {
      chrome.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

      const response = await dispatch('EXTRACT_PAGE_CONTENT', { tabId: 42 });

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('CONTENT_SCRIPT_UNAVAILABLE');
      expect(response.error).toMatch(/browser pages or the Chrome Web Store/);
    });

    it('fails clearly when there is no tab at all', async () => {
      const response = await dispatch('EXTRACT_PAGE_CONTENT', {});

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('NO_TAB');
    });
  });

  describe('analysis actions', () => {
    it('parses a sentiment reply into structured fields', async () => {
      global.fetch.mockResolvedValue(
        okResponse({ content: [{ type: 'text', text: 'Sentiment: positive\nReason: upbeat tone' }] })
      );

      const response = await dispatch('ANALYZE_SENTIMENT', { text: 'A glowing review.' });

      expect(response.success).toBe(true);
      expect(response.data.sentiment).toBe('positive');
      expect(response.data.reason).toBe('upbeat tone');
    });

    it('parses smart tags into an array', async () => {
      global.fetch.mockResolvedValue(
        okResponse({ content: [{ type: 'text', text: 'ai, browsers, privacy' }] })
      );

      const response = await dispatch('GENERATE_SMART_TAGS', { text: 'An article.' });

      expect(response.data.tags).toEqual(['ai', 'browsers', 'privacy']);
    });
  });

  describe('message validation', () => {
    it('rejects a message with no actionType', async () => {
      const handler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = vi.fn();
      handler({ payload: {} }, { id: 'mock-extension-id' }, sendResponse);

      await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
      expect(sendResponse.mock.calls[0][0]).toMatchObject({ success: false });
    });

    it('rejects an unknown action type', async () => {
      const response = await dispatch('DROP_DATABASE', {});
      expect(response.errorCode).toBe('UNSUPPORTED_ACTION');
    });
  });

  describe('context menus', () => {
    it('registers menu items on install', async () => {
      const installHandler = chrome.runtime.onInstalled.addListener.mock.calls[0][0];
      await installHandler({ reason: 'install' });

      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
      const ids = chrome.contextMenus.create.mock.calls.map(call => call[0].id);
      expect(ids).toContain('genai-summarize-selection');
    });

    it('summarizes a selection and notifies the user', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);
      const clickHandler = chrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      await clickHandler(
        { menuItemId: 'genai-summarize-selection', selectionText: 'Some selected text' },
        { id: 1 }
      );

      expect(global.fetch).toHaveBeenCalled();
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Summary' })
      );
    });

    it('notifies on failure instead of failing silently', async () => {
      global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const clickHandler = chrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      await clickHandler(
        { menuItemId: 'genai-summarize-selection', selectionText: 'text' },
        { id: 1 }
      );

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Failed to fetch') })
      );
    });

    it('ignores menu ids it does not own', async () => {
      const clickHandler = chrome.contextMenus.onClicked.addListener.mock.calls[0][0];
      await clickHandler({ menuItemId: 'some-other-extension-item' }, { id: 1 });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
