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
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(body),
  };
}

const CLAUDE_REPLY = okResponse({
  content: [{ type: 'text', text: '- point one\n- point two' }],
});

/** Preferences with a working Anthropic key. */
const CONFIGURED = {
  user_preferences: {
    initialized: true,
    preferredProvider: 'anthropic',
    apiKeys: { anthropic: 'sk-ant-test' },
    models: {},
    features: { contextMenus: true, notifications: true, saveHistory: true },
    summaryType: 'key-points',
    summaryLength: 'medium',
  },
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
  handler(
    { actionType, requestId: 'req-1', payload },
    { id: 'mock-extension-id' },
    sendResponse
  );
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
        targetLength: 'medium',
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
            expect.objectContaining({ provider: 'anthropic' }),
          ]),
        })
      );
    });

    it('summarizes a long page as sections plus one merge, not a truncation', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);

      // Three chunks' worth of paragraphs.
      const longPage = Array.from(
        { length: 80 },
        (_, i) => `Paragraph ${i}. ${'word '.repeat(180)}`
      ).join('\n\n');

      const response = await dispatch('GENERATE_CONTENT_SUMMARY', {
        content: longPage,
        summaryType: 'key-points',
      });

      expect(response.success).toBe(true);
      expect(response.data.sections).toBeGreaterThan(1);
      expect(response.data.droppedChars).toBe(0);
      expect(response.data.truncated).toBe(false);

      // One request per section, plus a final merge.
      expect(global.fetch).toHaveBeenCalledTimes(response.data.sections + 1);

      const bodies = global.fetch.mock.calls.map(call =>
        JSON.parse(call[1].body)
      );
      const mapCalls = bodies.filter(b =>
        b.system.includes('You are reading section')
      );
      const reduceCalls = bodies.filter(b =>
        b.system.includes('You are given ordered notes')
      );
      expect(mapCalls).toHaveLength(response.data.sections);
      expect(reduceCalls).toHaveLength(1);

      // The merge step reads our own notes, so it is not fenced as untrusted.
      expect(reduceCalls[0].messages[0].content).not.toContain(
        '<<<PAGE_CONTENT>>>'
      );
    });

    it('still issues exactly one call for a page that fits', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);

      const response = await dispatch('GENERATE_CONTENT_SUMMARY', {
        content: 'A short article.',
      });

      expect(response.data.sections).toBe(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('rejects empty content before spending an API call', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);

      const response = await dispatch('GENERATE_CONTENT_SUMMARY', {
        content: '   ',
      });

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('NO_CONTENT');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('tells the user to configure a key instead of inventing a summary', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          initialized: true,
          preferredProvider: 'anthropic',
          apiKeys: {},
        },
      });

      const response = await dispatch('GENERATE_CONTENT_SUMMARY', {
        content: 'article text',
      });

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
        json: vi
          .fn()
          .mockResolvedValue({ error: { message: 'rate limit exceeded' } }),
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
          json: vi.fn().mockResolvedValue({ error: { message: 'slow down' } }),
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
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        data: { mainText: 'page text' },
      });

      const response = await dispatch('EXTRACT_PAGE_CONTENT', { tabId: 42 });

      expect(response.success).toBe(true);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
        action: 'extractContent',
      });
    });

    it('explains why restricted pages cannot be read', async () => {
      chrome.tabs.sendMessage.mockRejectedValue(
        new Error('Receiving end does not exist')
      );

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

    it.each([
      [undefined, 'Content extraction failed'],
      [
        { success: false, error: 'Page is still loading' },
        'Page is still loading',
      ],
    ])(
      'reports an unsuccessful content-script response (%j)',
      async (reply, error) => {
        chrome.tabs.sendMessage.mockResolvedValueOnce(reply);

        const response = await dispatch('EXTRACT_PAGE_CONTENT', { tabId: 42 });

        expect(response).toMatchObject({
          success: false,
          errorCode: 'EXTRACTION_FAILED',
          error,
        });
        expect(global.fetch).not.toHaveBeenCalled();
      }
    );
  });

  describe('the message boundary', () => {
    /**
     * `dispatch` always sends a well-formed message from this extension. These
     * go around it to exercise what the router rejects.
     *
     * @param {any} message
     * @param {any} sender
     */
    function dispatchRaw(message, sender) {
      const handler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const sendResponse = vi.fn();
      handler(message, sender, sendResponse);
      return vi.waitFor(() => {
        expect(sendResponse).toHaveBeenCalled();
        return sendResponse.mock.calls[0][0];
      });
    }

    const self = { id: 'mock-extension-id' };

    it.each([
      ['a null message', null, self],
      ['a message with no actionType', { requestId: 'r' }, self],
      ['a non-string actionType', { actionType: 7 }, self],
      ['no sender at all', { actionType: 'GET_HISTORY' }, null],
      [
        'a sender that is not this extension',
        { actionType: 'GET_HISTORY' },
        { id: 'other' },
      ],
    ])('rejects %s', async (_label, message, sender) => {
      const response = await dispatchRaw(message, sender);

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('INVALID_MESSAGE');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects an actionType it does not route, without spending a call', async () => {
      const response = await dispatch('DO_SOMETHING_ELSE', {});

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('UNSUPPORTED_ACTION');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('extracts from the sender tab when no explicit tab id is supplied', async () => {
      chrome.tabs.sendMessage.mockResolvedValueOnce({
        success: true,
        data: { mainText: 'Sender page' },
      });

      const response = await dispatchRaw(
        { actionType: 'EXTRACT_PAGE_CONTENT' },
        { ...self, tab: { id: 7 } }
      );

      expect(response).toMatchObject({
        success: true,
        data: { mainText: 'Sender page' },
      });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
        action: 'extractContent',
      });
    });
  });

  describe('question validation', () => {
    it.each([
      ['an empty question', ''],
      ['a whitespace-only question', '   \n '],
      ['a missing question', undefined],
      ['a question past the 1,000 character cap', 'x'.repeat(1001)],
    ])('rejects %s before calling a provider', async (_label, question) => {
      const response = await dispatch('ANSWER_CONTEXTUAL_QUESTION', {
        question,
        context: 'page text',
      });

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe('INVALID_QUESTION');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    // Regression: the filter that used to guard this rejected ordinary
    // questions, and returned a different verdict depending on how many times
    // it had been called. Both are asserted directly in
    // tests/utils/validation-service.test.js; this pins the end-to-end path.
    it.each([
      'Is there only one=1 result?',
      'What is the <iframe> for?',
      'What does the onclick= attribute do on this page?',
    ])('answers the legitimate question %j', async question => {
      global.fetch.mockResolvedValue(
        okResponse({ content: [{ type: 'text', text: 'An answer.' }] })
      );

      const response = await dispatch('ANSWER_CONTEXTUAL_QUESTION', {
        question,
        context: 'page text',
      });

      expect(response.success).toBe(true);
      expect(response.data.answer).toBe('An answer.');
    });

    it('accepts the same question repeatedly', async () => {
      global.fetch.mockResolvedValue(
        okResponse({ content: [{ type: 'text', text: 'An answer.' }] })
      );
      const question = 'What does javascript: mean here?';

      for (let i = 0; i < 3; i++) {
        const response = await dispatch('ANSWER_CONTEXTUAL_QUESTION', {
          question,
          context: 'page text',
        });
        expect(response.success).toBe(true);
      }
    });
  });

  describe('analysis actions', () => {
    it('parses a sentiment reply into structured fields', async () => {
      global.fetch.mockResolvedValue(
        okResponse({
          content: [
            { type: 'text', text: 'Sentiment: positive\nReason: upbeat tone' },
          ],
        })
      );

      const response = await dispatch('ANALYZE_SENTIMENT', {
        text: 'A glowing review.',
      });

      expect(response.success).toBe(true);
      expect(response.data.sentiment).toBe('positive');
      expect(response.data.reason).toBe('upbeat tone');
    });

    it('parses smart tags into an array', async () => {
      global.fetch.mockResolvedValue(
        okResponse({
          content: [{ type: 'text', text: 'ai, browsers, privacy' }],
        })
      );

      const response = await dispatch('GENERATE_SMART_TAGS', {
        text: 'An article.',
      });

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
      const installHandler =
        chrome.runtime.onInstalled.addListener.mock.calls[0][0];
      await installHandler({ reason: 'install' });

      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
      const ids = chrome.contextMenus.create.mock.calls.map(call => call[0].id);
      expect(ids).toContain('genai-summarize-selection');
    });

    it('summarizes a selection and notifies the user', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);
      const clickHandler =
        chrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      await clickHandler(
        {
          menuItemId: 'genai-summarize-selection',
          selectionText: 'Some selected text',
        },
        { id: 1 }
      );

      expect(global.fetch).toHaveBeenCalled();
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Summary' })
      );
    });

    it('notifies on failure instead of failing silently', async () => {
      global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const clickHandler =
        chrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      await clickHandler(
        { menuItemId: 'genai-summarize-selection', selectionText: 'text' },
        { id: 1 }
      );

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Failed to fetch'),
        })
      );
    });

    it('ignores menu ids it does not own', async () => {
      const clickHandler =
        chrome.contextMenus.onClicked.addListener.mock.calls[0][0];
      await clickHandler(
        { menuItemId: 'some-other-extension-item' },
        { id: 1 }
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('extracts page text for a page-sourced menu action', async () => {
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        data: { mainText: 'Full page text' },
      });
      global.fetch.mockResolvedValue(CLAUDE_REPLY);
      const clickHandler =
        chrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      await clickHandler({ menuItemId: 'genai-summarize-page' }, { id: 42 });

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
        action: 'extractContent',
      });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.messages[0].content).toContain('Full page text');
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Page summary' })
      );
    });

    it('reports a missing tab without calling the provider', async () => {
      const clickHandler =
        chrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      await clickHandler({ menuItemId: 'genai-summarize-page' });

      expect(global.fetch).not.toHaveBeenCalled();
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No active tab to read content from',
        })
      );
    });

    it('reports a missing selection without calling the provider', async () => {
      const clickHandler =
        chrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      await clickHandler(
        { menuItemId: 'genai-summarize-selection' },
        { id: 1 }
      );

      expect(global.fetch).not.toHaveBeenCalled();
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No page content available for this action',
        })
      );
    });

    it('bounds long results to a readable notification', async () => {
      global.fetch.mockResolvedValue(
        okResponse({ content: [{ type: 'text', text: 'x'.repeat(300) }] })
      );
      const clickHandler =
        chrome.contextMenus.onClicked.addListener.mock.calls[0][0];

      await clickHandler(
        { menuItemId: 'genai-explain-selection', selectionText: 'text' },
        { id: 1 }
      );

      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Key points',
          message: `${'x'.repeat(200)}…`,
        })
      );
    });
  });

  describe('keyboard commands', () => {
    it('summarizes the active tab for quick-summarize', async () => {
      chrome.tabs.query.mockResolvedValueOnce([{ id: 42 }]);
      chrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        data: { mainText: 'Page text' },
      });
      global.fetch.mockResolvedValue(CLAUDE_REPLY);
      const commandHandler =
        chrome.commands.onCommand.addListener.mock.calls[0][0];

      await commandHandler('quick-summarize');

      expect(chrome.tabs.query).toHaveBeenCalledWith({
        active: true,
        currentWindow: true,
      });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
        action: 'extractContent',
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('reports when quick-summarize has no active tab', async () => {
      chrome.tabs.query.mockResolvedValueOnce([]);
      const commandHandler =
        chrome.commands.onCommand.addListener.mock.calls[0][0];

      await commandHandler('quick-summarize');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(chrome.notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No active tab to read content from',
        })
      );
    });

    it('ignores commands it does not handle', async () => {
      const commandHandler =
        chrome.commands.onCommand.addListener.mock.calls[0][0];

      await commandHandler('other-command');

      expect(chrome.tabs.query).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('worker lifecycle', () => {
    it.each(['install', 'update'])(
      'opens options only on first install (%s)',
      async reason => {
        const installHandler =
          chrome.runtime.onInstalled.addListener.mock.calls[0][0];
        chrome.contextMenus.create.mockClear();

        await installHandler({ reason });

        expect(chrome.contextMenus.create).toHaveBeenCalledTimes(7);
        expect(chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(
          reason === 'install' ? 1 : 0
        );
      }
    );

    it('keeps routing messages after startup configuration loading fails', async () => {
      vi.resetModules();
      vi.clearAllMocks();
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
      chrome.storage.sync.get.mockRejectedValueOnce(
        new Error('Storage temporarily unavailable')
      );

      try {
        await import('../../background.js');
        await vi.waitFor(() =>
          expect(errorLog).toHaveBeenCalledWith(
            expect.stringContaining('Service initialization failed'),
            'Storage temporarily unavailable'
          )
        );

        expect(chrome.commands.onCommand.addListener).toHaveBeenCalledOnce();
        expect(
          chrome.contextMenus.onClicked.addListener
        ).toHaveBeenCalledOnce();
        expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalledOnce();
        expect(chrome.alarms.onAlarm.addListener).toHaveBeenCalledOnce();
        const response = await dispatch('GET_HISTORY', {});
        expect(response).toMatchObject({
          success: true,
          data: { summaries: [], conversations: [] },
        });
      } finally {
        errorLog.mockRestore();
      }
    });

    it('prunes old history on the scheduled cleanup alarm', async () => {
      const oldEntry = {
        id: 'old',
        timestamp: Date.now() - 91 * 24 * 60 * 60 * 1000,
      };
      chrome.storage.local.get.mockResolvedValue({
        genai_summary_history: [oldEntry],
        genai_conversation_history: [oldEntry],
      });
      const alarmHandler = chrome.alarms.onAlarm.addListener.mock.calls[0][0];

      await alarmHandler({ name: 'cleanupOldData' });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        genai_summary_history: [],
      });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        genai_conversation_history: [],
      });
    });

    it('ignores unrelated alarms', async () => {
      const alarmHandler = chrome.alarms.onAlarm.addListener.mock.calls[0][0];

      await alarmHandler({ name: 'another-alarm' });

      expect(chrome.storage.local.get).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    beforeEach(() => {
      chrome.storage.local.get.mockImplementation(
        async (/** @type {string[]} */ keys) =>
          Object.fromEntries(
            keys
              .filter(key => key === 'genai_summary_history')
              .map(key => [key, [{ id: 'sum-1', summary: 'a saved summary' }]])
          )
      );
    });

    // Regression: the export was built from a `genai_user_preferences` key in
    // local storage that nothing ever wrote, so it reported that key's
    // hardcoded defaults — `aiProvider: 'chrome-ai'`, a provider removed in
    // 5.0.0 — and never the settings the user had actually chosen.
    it('reports the settings the user actually chose', async () => {
      const response = await dispatch('EXPORT_USER_DATA', {});

      expect(response.success).toBe(true);
      expect(response.data.settings).toMatchObject({
        preferredProvider: 'anthropic',
        summaryType: 'key-points',
      });
      expect(response.data.settings).not.toHaveProperty('aiProvider');
    });

    it('never includes API keys', async () => {
      const response = await dispatch('EXPORT_USER_DATA', {});

      expect(response.data.settings).not.toHaveProperty('apiKeys');
      expect(JSON.stringify(response.data)).not.toContain('sk-ant-test');
    });

    it('includes saved history', async () => {
      const response = await dispatch('EXPORT_USER_DATA', {});

      expect(response.data.summaries).toEqual([
        expect.objectContaining({ summary: 'a saved summary' }),
      ]);
      expect(response.data.conversations).toEqual([]);
    });

    // Regression: this returned a JSON *string*, which the popup then stringified
    // again, so the downloaded file was a quoted string literal containing
    // escaped JSON rather than a JSON document.
    it('returns an object so the popup serialises it exactly once', async () => {
      const response = await dispatch('EXPORT_USER_DATA', {});

      expect(typeof response.data).toBe('object');
      expect(JSON.parse(JSON.stringify(response.data, null, 2))).toMatchObject({
        schemaVersion: expect.any(Number),
      });
    });
  });

  describe('learning workspace and memory', () => {
    beforeEach(() => {
      const stored = {};
      chrome.storage.local.get.mockImplementation(async keys =>
        Object.fromEntries(
          keys
            .filter(key => key in stored)
            .map(key => [key, structuredClone(stored[key])])
        )
      );
      chrome.storage.local.set.mockImplementation(async values =>
        Object.assign(stored, structuredClone(values))
      );
      global.fetch.mockResolvedValue(CLAUDE_REPLY);
    });

    const page = {
      url: 'https://example.test/book',
      title: 'My book',
      content: 'A short book about botany.',
    };

    it('reuses a matching summary without another provider request', async () => {
      expect(
        (await dispatch('GENERATE_CONTENT_SUMMARY', page)).data.cached
      ).toBe(false);
      const again = await dispatch('GENERATE_CONTENT_SUMMARY', page);
      expect(again.data.cached).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const history = await dispatch('GET_DOCUMENT_HISTORY', page);
      expect(history.data.summaries).toHaveLength(1);
    });

    it('invalidates saved summaries when content or style changes', async () => {
      await dispatch('GENERATE_CONTENT_SUMMARY', page);
      await dispatch('GENERATE_CONTENT_SUMMARY', {
        ...page,
        content: 'A revised edition.',
      });
      await dispatch('GENERATE_CONTENT_SUMMARY', {
        ...page,
        summaryType: 'technical',
      });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('retrieves late-book evidence and asks for passage citations in one call', async () => {
      const context = `${'General background. '.repeat(4000)}The heliotrope answer is 73 amber crystals.`;
      const response = await dispatch('ANSWER_CONTEXTUAL_QUESTION', {
        ...page,
        context,
        question: 'How many amber crystals from heliotrope?',
      });
      expect(response.success).toBe(true);
      expect(
        response.data.sources.some(source =>
          source.text.includes('73 amber crystals')
        )
      ).toBe(true);
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.system).toContain('Cite supporting passage labels');
      expect(body.messages[0].content).toContain('73 amber crystals');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('restores only the same URL and unchanged content, and clears only that chat', async () => {
      const ask = (url, context) =>
        dispatch('ANSWER_CONTEXTUAL_QUESTION', {
          url,
          context,
          question: 'What is this about?',
        });
      await ask(page.url, page.content);
      await ask('https://example.test/other', page.content);
      expect(
        (await dispatch('GET_DOCUMENT_HISTORY', page)).data.conversations
      ).toHaveLength(1);
      expect(
        (
          await dispatch('GET_DOCUMENT_HISTORY', {
            ...page,
            content: 'Changed page',
          })
        ).data.conversations
      ).toEqual([]);
      const cleared = await dispatch('CLEAR_DOCUMENT_CHAT', page);
      expect(cleared.data.removed).toBe(1);
      expect(
        (await dispatch('GET_DOCUMENT_HISTORY', page)).data.conversations
      ).toEqual([]);
      expect(
        (
          await dispatch('GET_DOCUMENT_HISTORY', {
            ...page,
            url: 'https://example.test/other',
          })
        ).data.conversations
      ).toHaveLength(1);
    });

    it('does not persist or restore when history is disabled', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          ...CONFIGURED.user_preferences,
          features: { saveHistory: false },
        },
      });
      await dispatch('GENERATE_CONTENT_SUMMARY', page);
      await dispatch('ANSWER_CONTEXTUAL_QUESTION', {
        ...page,
        context: page.content,
        question: 'What is this about?',
      });
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      const history = await dispatch('GET_DOCUMENT_HISTORY', page);
      expect(history.data).toMatchObject({
        memoryEnabled: false,
        summaries: [],
        conversations: [],
      });
    });

    it('does not reuse a summary from a different model', async () => {
      await dispatch('GENERATE_CONTENT_SUMMARY', page);
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          ...CONFIGURED.user_preferences,
          models: { anthropic: 'my-custom-model' },
        },
      });
      const result = await dispatch('GENERATE_CONTENT_SUMMARY', page);
      expect(result.data.cached).toBe(false);
      expect(result.data.model).toBe('my-custom-model');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('keeps evidence scoped correctly when switching among several documents', async () => {
      for (const chapter of [1, 2, 3, 4, 1]) {
        const context = `This is chapter ${chapter}. Its special evidence is violet-${chapter}.`;
        const result = await dispatch('ANSWER_CONTEXTUAL_QUESTION', {
          url: `https://example.test/${chapter}`,
          context,
          question: 'What evidence is violet?',
        });
        expect(result.data.sources[0].text).toBe(context);
      }
    });
  });

  describe('on-demand provider checks', () => {
    it('tests the requested provider without saving its key', async () => {
      global.fetch.mockResolvedValue(CLAUDE_REPLY);
      const response = await dispatch('TEST_PROVIDER_CONNECTION', {
        provider: 'anthropic',
        apiKey: 'probe-key',
        model: 'my-model',
      });
      expect(response).toMatchObject({
        success: true,
        data: { model: 'my-model' },
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      expect(JSON.stringify(response)).not.toContain('probe-key');
    });

    it.each([
      [
        'auth',
        () =>
          Promise.resolve({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: async () => ({ error: { message: 'invalid key' } }),
          }),
        '401',
      ],
      [
        'network',
        () => Promise.reject(new TypeError('Failed to fetch')),
        'Failed to fetch',
      ],
    ])(
      'reports %s failure without retries',
      async (_label, request, expected) => {
        global.fetch.mockImplementation(request);
        const response = await dispatch('TEST_PROVIDER_CONNECTION', {
          provider: 'anthropic',
          apiKey: 'probe-key',
        });
        expect(response.success).toBe(false);
        expect(response.error).toContain(expected);
        expect(global.fetch).toHaveBeenCalledTimes(1);
      }
    );
  });
});
