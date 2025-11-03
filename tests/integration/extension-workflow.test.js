import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Extension Integration Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('content summarization workflow', () => {
    it('should complete full summarization workflow', async () => {
      // Mock successful AI provider response
      const mockSummary = {
        summary: 'This is a test summary of the content.',
        confidence: 0.95,
        processingTime: 1500
      };

      // Simulate content script sending summarization request
      const message = {
        actionType: 'GENERATE_CONTENT_SUMMARY',
        requestId: 'test-summary-001',
        payload: {
          content: 'This is a long piece of content that needs to be summarized for better understanding.',
          summaryType: 'key-points',
          targetLength: 'medium'
        }
      };

      const sender = {
        tab: { id: 1, url: 'https://example.com/article' }
      };

      // Mock chrome runtime message passing
      let messageHandler;
      chrome.runtime.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      // Mock response callback
      const sendResponse = vi.fn();

      // Simulate message handling
      if (messageHandler) {
        await messageHandler(message, sender, sendResponse);
      }

      // Verify response was sent with expected structure
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        data: expect.any(Object),
        requestId: 'test-summary-001',
        processingTime: expect.any(Number)
      });
    });

    it('should handle summarization errors gracefully', async () => {
      const message = {
        actionType: 'GENERATE_CONTENT_SUMMARY',
        requestId: 'test-error-001',
        payload: {
          content: '', // Empty content should cause error
          summaryType: 'key-points'
        }
      };

      const sender = {
        tab: { id: 1, url: 'https://example.com' }
      };

      let messageHandler;
      chrome.runtime.onMessage.addListener.mockImplementation((handler) => {
        messageHandler = handler;
      });

      const sendResponse = vi.fn();

      if (messageHandler) {
        await messageHandler(message, sender, sendResponse);
      }

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: expect.any(String),
        errorCode: expect.any(String),
        requestId: 'test-error-001',
        processingTime: expect.any(Number)
      });
    });
  });

  describe('context menu integration', () => {
    it('should register context menu items on installation', () => {
      const expectedMenuItems = [
        'genai-summarize-selection',
        'genai-explain-selection',
        'genai-translate-selection',
        'genai-analyze-sentiment',
        'genai-summarize-page',
        'genai-extract-insights',
        'genai-generate-tags'
      ];

      // Simulate extension installation
      let installHandler;
      chrome.runtime.onInstalled.addListener.mockImplementation((handler) => {
        installHandler = handler;
      });

      if (installHandler) {
        installHandler({ reason: 'install' });
      }

      // Verify context menus were created
      expect(chrome.contextMenus.removeAll).toHaveBeenCalled();
      expect(chrome.contextMenus.create).toHaveBeenCalledTimes(expectedMenuItems.length + 1); // +1 for separator
    });

    it('should handle context menu clicks', () => {
      const menuInfo = {
        menuItemId: 'genai-summarize-selection',
        selectionText: 'Selected text to summarize'
      };

      const tab = {
        id: 1,
        url: 'https://example.com'
      };

      let contextMenuHandler;
      chrome.contextMenus.onClicked.addListener.mockImplementation((handler) => {
        contextMenuHandler = handler;
      });

      if (contextMenuHandler) {
        contextMenuHandler(menuInfo, tab);
      }

      // Verify notification was triggered for quick action
      expect(chrome.notifications.create).toHaveBeenCalled();
    });
  });

  describe('keyboard shortcuts', () => {
    it('should handle keyboard command triggers', () => {
      const commands = [
        'toggle-popup',
        'quick-summarize',
        'analyze-selection'
      ];

      let commandHandler;
      chrome.commands.onCommand.addListener.mockImplementation((handler) => {
        commandHandler = handler;
      });

      commands.forEach(command => {
        if (commandHandler) {
          commandHandler(command);
        }
      });

      // Verify commands were processed
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

      chrome.storage.local.set.mockResolvedValue();
      chrome.storage.local.get.mockResolvedValue({ userPreferences: preferences });

      // Simulate preference update
      await chrome.storage.local.set({ userPreferences: preferences });
      const stored = await chrome.storage.local.get('userPreferences');

      expect(chrome.storage.local.set).toHaveBeenCalledWith({ userPreferences: preferences });
      expect(stored.userPreferences).toEqual(preferences);
    });

    it('should handle storage quota exceeded', async () => {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      
      chrome.storage.local.set.mockRejectedValue(error);

      await expect(chrome.storage.local.set({ largeData: 'x'.repeat(1000000) }))
        .rejects.toThrow('Quota exceeded');
    });
  });
});