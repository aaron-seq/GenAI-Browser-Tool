import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '../../services/storage-service.js';

/**
 * Back `chrome.storage.local.get` with a plain object, so a test can state what
 * is stored once instead of matching on the key it will be asked for.
 *
 * @param {Record<string, any>} contents
 */
function givenStored(contents) {
  chrome.storage.local.get.mockImplementation(async (/** @type {string[]} */ keys) =>
    Object.fromEntries(keys.filter(key => key in contents).map(key => [key, contents[key]]))
  );
}

describe('StorageService', () => {
  /** @type {StorageService} */
  let storageService;

  beforeEach(() => {
    storageService = new StorageService();
    vi.clearAllMocks();
  });

  describe('summary history', () => {
    it('saves a summary to local history under the summary key', async () => {
      const summary = {
        originalContent: 'Test content to summarize',
        summary: 'Test summary',
        options: { type: 'key-points', length: 'medium' },
        provider: 'openai',
        timestamp: Date.now()
      };

      await storageService.saveSummaryHistory(summary);

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['genai_summary_history']);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        genai_summary_history: [expect.objectContaining(summary)]
      });
    });

    it('returns the id it assigned', async () => {
      const id = await storageService.saveSummaryHistory({ summary: 'a' });
      expect(id).toEqual(expect.any(String));
      expect(id.length).toBeGreaterThan(0);
    });

    it('keeps the newest entry first and drops past the cap', async () => {
      const existing = Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
        summary: `Summary ${i}`,
        timestamp: Date.now() - i * 1000
      }));
      chrome.storage.local.get.mockResolvedValue({ genai_summary_history: existing });

      const newest = { summary: 'New summary', timestamp: Date.now() };
      await storageService.saveSummaryHistory(newest);

      const written = chrome.storage.local.set.mock.calls[0][0].genai_summary_history;
      expect(written).toHaveLength(1000);
      expect(written[0]).toEqual(expect.objectContaining(newest));
    });
  });

  describe('conversation history', () => {
    it('saves an exchange under the conversation key', async () => {
      const exchange = {
        question: 'What is this about?',
        answer: 'This is about testing',
        context: 'Test context',
        timestamp: Date.now()
      };

      await storageService.updateConversationHistory(exchange);

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['genai_conversation_history']);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        genai_conversation_history: [expect.objectContaining(exchange)]
      });
    });
  });

  describe('getAnalysisHistory', () => {
    it('returns both lists and a total', async () => {
      givenStored({
        genai_summary_history: [{ id: 'a' }, { id: 'b' }],
        genai_conversation_history: [{ id: 'c' }]
      });

      const history = await storageService.getAnalysisHistory();

      expect(history.summaries).toHaveLength(2);
      expect(history.conversations).toHaveLength(1);
      expect(history.totalItems).toBe(3);
    });

    it('reports empty lists when nothing is stored', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      expect(await storageService.getAnalysisHistory()).toEqual({
        summaries: [],
        conversations: [],
        totalItems: 0
      });
    });
  });

  describe('cleanupOldData', () => {
    it('removes entries past the retention window and reports the counts', async () => {
      const now = Date.now();
      const old = { timestamp: now - 91 * 24 * 60 * 60 * 1000, summary: 'Old' };
      const recent = { timestamp: now - 10 * 24 * 60 * 60 * 1000, summary: 'Recent' };

      chrome.storage.local.get.mockResolvedValue({
        genai_summary_history: [old, recent],
        genai_conversation_history: [old, recent]
      });

      const removed = await storageService.cleanupOldData();

      expect(removed).toEqual({ summariesRemoved: 1, conversationsRemoved: 1 });
      for (const call of chrome.storage.local.set.mock.calls) {
        expect(Object.values(call[0])[0]).toEqual([recent]);
      }
    });

    // An unreadable age is not evidence of being old. Deleting a user's data on
    // that guess is worse than keeping a few stale rows.
    it('keeps entries that carry no timestamp', async () => {
      chrome.storage.local.get.mockResolvedValue({
        genai_summary_history: [{ summary: 'undated' }],
        genai_conversation_history: []
      });

      const removed = await storageService.cleanupOldData();

      expect(removed.summariesRemoved).toBe(0);
    });

    it('does not write when nothing needs removing', async () => {
      chrome.storage.local.get.mockResolvedValue({
        genai_summary_history: [{ timestamp: Date.now() }],
        genai_conversation_history: []
      });

      await storageService.cleanupOldData();

      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('falls back to the default when a read fails', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      await expect(storageService.saveSummaryHistory({})).resolves.toEqual(expect.any(String));
    });

    it('starts a fresh list when the stored value is not an array', async () => {
      chrome.storage.local.get.mockResolvedValue({ genai_summary_history: 'invalid-data' });

      const summary = { summary: 'Test summary', timestamp: Date.now() };
      await storageService.saveSummaryHistory(summary);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        genai_summary_history: [expect.objectContaining(summary)]
      });
    });

    it('propagates a write failure rather than reporting success', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      chrome.storage.local.set.mockRejectedValue(new Error('Quota exceeded'));

      await expect(storageService.saveSummaryHistory({ summary: 'a' }))
        .rejects.toThrow(/Quota exceeded/);
    });
  });
});
