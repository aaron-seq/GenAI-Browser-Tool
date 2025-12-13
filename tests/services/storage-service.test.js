import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StorageService } from '../../services/storage-service.js';

describe('StorageService', () => {
  /** @type {StorageService} */
  let storageService;

  beforeEach(() => {
    storageService = new StorageService();
    vi.clearAllMocks();
  });

  describe('summary history', () => {
    it('should save summary to history', async () => {
      const summaryData = {
        originalContent: 'Test content to summarize',
        summary: 'Test summary',
        options: { type: 'key-points', length: 'medium' },
        provider: 'openai',
        timestamp: Date.now()
      };

      await storageService.saveSummaryHistory(summaryData);

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['genai_summary_history']);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        genai_summary_history: expect.arrayContaining([
          expect.objectContaining(summaryData)
        ])
      });
    });

    it('should limit summary history to maximum entries', async () => {
      const existingHistory = Array(100).fill(null).map((_, i) => ({
        id: i,
        summary: `Summary ${i}`,
        timestamp: Date.now() - i * 1000
      }));

      chrome.storage.local.get.mockResolvedValue({ genai_summary_history: existingHistory });

      const newSummary = {
        originalContent: 'New content',
        summary: 'New summary',
        timestamp: Date.now()
      };

      storageService.storageQuota.summaryHistory = 100;
      await storageService.saveSummaryHistory(newSummary);

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.genai_summary_history).toHaveLength(100); // Should not exceed limit
      expect(setCall.genai_summary_history[0]).toEqual(expect.objectContaining({
        ...newSummary,
        id: expect.any(String),
        schemaVersion: expect.any(String)
      })); // New entry should be first
    });
  });

  describe('conversation history', () => {
    it('should update conversation history', async () => {
      const conversationData = {
        question: 'What is this about?',
        answer: 'This is about testing',
        context: 'Test context',
        timestamp: Date.now()
      };

      await storageService.updateConversationHistory(conversationData);

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['genai_conversation_history']);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        genai_conversation_history: expect.arrayContaining([
          expect.objectContaining(conversationData)
        ])
      });
    });
  });

  describe('data cleanup', () => {
    it('should clean up old data beyond retention period', async () => {
      const now = Date.now();
      const oldData = {
        timestamp: now - (91 * 24 * 60 * 60 * 1000), // 91 days old (beyond 90 limit)
        summary: 'Old summary'
      };
      const recentData = {
        timestamp: now - (10 * 24 * 60 * 60 * 1000), // 10 days old
        summary: 'Recent summary'
      };

      chrome.storage.local.get.mockResolvedValue({
        genai_summary_history: [oldData, recentData],
        genai_conversation_history: [oldData, recentData]
      });

      await storageService.cleanupOldData();

      const setCalls = chrome.storage.local.set.mock.calls;
      const summaryUpdate = setCalls.find(call => call[0].genai_summary_history);
      const conversationUpdate = setCalls.find(call => call[0].genai_conversation_history);

      expect(summaryUpdate[0].genai_summary_history).toHaveLength(1);
      expect(summaryUpdate[0].genai_summary_history[0]).toEqual(recentData);
      
      expect(conversationUpdate[0].genai_conversation_history).toHaveLength(1);
      expect(conversationUpdate[0].genai_conversation_history[0]).toEqual(recentData);
    });
  });

  describe('error handling', () => {
    it('should handle storage errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      // Service swallows error and logs it, checks if it doesn't throw
      await expect(storageService.saveSummaryHistory({})).resolves.not.toThrow();
    });

    it('should handle corrupted data gracefully', async () => {
      chrome.storage.local.get.mockResolvedValue({ genai_summary_history: 'invalid-data' });

      const summaryData = {
        originalContent: 'Test',
        summary: 'Test summary',
        timestamp: Date.now()
      };

      await storageService.saveSummaryHistory(summaryData);

      // Should create new array when existing data is corrupted
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        genai_summary_history: [
          expect.objectContaining(summaryData)
        ]
      });
    });
  });
});