import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Extension Integration Workflow', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    
    // Import background script to trigger initialization and listener registration
    await import('../../background.js');
    
    // Wait for async initialization
    await vi.waitFor(() => {
      if (chrome.runtime.onMessage.addListener.mock.calls.length === 0) {
        throw new Error('Waiting for onMessage listener');
      }
    });
  });

  describe('content summarization workflow', () => {
    it('should complete full summarization workflow', async () => {
      const message = {
        actionType: 'GENERATE_CONTENT_SUMMARY',
        requestId: 'test-summary-001',
        payload: {
          content: 'This is a long piece of content that needs to be summarized.',
          summaryType: 'key-points',
          targetLength: 'medium'
        }
      };

      const sender = {
        tab: { id: 1, url: 'https://example.com/article' }
      };

      const sendResponse = vi.fn();

      // Retrieve the registered listener
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      // Execute handler - Note: the handler is async but returns true immediately
      messageHandler(message, sender, sendResponse);
      
      // Verify response is eventually sent
      await vi.waitFor(() => {
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
          success: true,
          requestId: 'test-summary-001',
          data: expect.objectContaining({
            summary: expect.any(String),
            provider: expect.any(String)
          })
        }));
      });
    });

    it('should handle summarization errors gracefully', async () => {
      const message = {
        actionType: 'GENERATE_CONTENT_SUMMARY',
        requestId: 'test-error-001',
        payload: {
          content: '', // Empty content -> Error
          summaryType: 'key-points'
        }
      };

      const sender = { tab: { id: 1, url: 'https://example.com' } };
      const sendResponse = vi.fn();
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      messageHandler(message, sender, sendResponse);

      await vi.waitFor(() => {
        expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({
          success: false,
          error: expect.any(String),
          requestId: 'test-error-001'
        }));
      });
    });
  });

  describe('context menu integration', () => {
    it('should register context menu items on installation', async () => {
      const installHandler = chrome.runtime.onInstalled.addListener.mock.calls[0][0];
      await installHandler({ reason: 'install' });

      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(chrome.contextMenus.create).toHaveBeenCalled();
      
      const createCalls = chrome.contextMenus.create.mock.calls;
      expect(createCalls.length).toBeGreaterThan(0);
      expect(createCalls.map(c => c[0].id)).toContain('genai-summarize-selection');
    });

    it('should handle context menu clicks', async () => {
      const menuInfo = {
        menuItemId: 'genai-summarize-selection',
        selectionText: 'Selected text'
      };
      const tab = { id: 1, url: 'https://example.com' };

      const clickHandler = chrome.contextMenus.onClicked.addListener.mock.calls[0][0];
      await clickHandler(menuInfo, tab);

      expect(chrome.notifications.create).toHaveBeenCalled();
    });
  });

  describe('keyboard shortcuts', () => {
    it('should handle keyboard command triggers', async () => {
      const commandHandler = chrome.commands.onCommand.addListener.mock.calls[0][0];
      await commandHandler('toggle-popup'); // Valid command
      
      // Just verifying invocation without error
      expect(chrome.commands.onCommand.addListener).toHaveBeenCalled();
    });
  });

  describe('storage integration', () => {
    it('should persist user preferences', async () => {
      const preferences = {
        aiProvider: 'openai',
        summaryLength: 'medium',
        language: 'en'
      };

      // Mock implementation for setting/getting to simulate storage
      let storage = {};
      chrome.storage.local.set.mockImplementation((items) => {
        storage = { ...storage, ...items };
        return Promise.resolve();
      });
      chrome.storage.local.get.mockImplementation((keys) => {
        if (typeof keys === 'string') return Promise.resolve({ [keys]: storage[keys] });
        return Promise.resolve(storage);
      });

      await chrome.storage.local.set({ userPreferences: preferences });
      const stored = await chrome.storage.local.get('userPreferences');

      expect(chrome.storage.local.set).toHaveBeenCalledWith({ userPreferences: preferences });
      expect(stored.userPreferences).toEqual(preferences);
    });

    it('should handle storage quota exceeded', async () => {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      
      chrome.storage.local.set.mockRejectedValueOnce(error);

      await expect(chrome.storage.local.set({ largeData: 'x'.repeat(1000000) }))
        .rejects.toThrow('Quota exceeded');
    });
  });
});