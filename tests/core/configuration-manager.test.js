import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurationManager } from '../../core/configuration-manager.js';
import { AIError } from '../../providers/ai-client.js';

describe('ConfigurationManager', () => {
  /** @type {ConfigurationManager} */
  let configManager;

  beforeEach(() => {
    configManager = new ConfigurationManager();
    vi.clearAllMocks();
    chrome.storage.sync.get.mockResolvedValue({});
  });

  describe('defaults', () => {
    it('returns a fully populated object when nothing is stored', async () => {
      const prefs = await configManager.getUserPreferences();

      expect(prefs.preferredProvider).toBe('anthropic');
      expect(prefs.apiKeys).toEqual({});
      expect(prefs.features.contextMenus).toBe(true);
    });

    it('writes defaults on first initialize', async () => {
      await configManager.initialize();
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        user_preferences: configManager.defaultSettings
      });
    });

    it('does not overwrite settings that already exist', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: { initialized: true, preferredProvider: 'openai' }
      });

      await configManager.initialize();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });
  });

  describe('reading stored settings', () => {
    it('fills in fields missing from an older stored object', async () => {
      // A v4 preferences object has no `features` key. Options page code read
      // settings.features.smartBookmarks directly and threw on every load.
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: { initialized: true, preferredProvider: 'openai' }
      });

      const prefs = await configManager.getUserPreferences();

      expect(prefs.preferredProvider).toBe('openai');
      expect(prefs.features).toBeDefined();
      expect(prefs.apiKeys).toEqual({});
      expect(prefs.models).toEqual({});
    });

    it('returns defaults rather than throwing when storage fails', async () => {
      chrome.storage.sync.get.mockRejectedValue(new Error('storage unavailable'));

      const prefs = await configManager.getUserPreferences();
      expect(prefs.preferredProvider).toBe('anthropic');
    });
  });

  describe('updating settings', () => {
    it('merges nested apiKeys instead of replacing the whole map', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: { initialized: true, apiKeys: { openai: 'sk-openai' } }
      });

      await configManager.updateUserPreferences({ apiKeys: { anthropic: 'sk-ant' } });

      const written = chrome.storage.sync.set.mock.calls[0][0].user_preferences;
      expect(written.apiKeys).toEqual({ openai: 'sk-openai', anthropic: 'sk-ant' });
    });

    it('merges top-level fields and stamps updatedAt', async () => {
      await configManager.updateUserPreferences({ summaryLength: 'long' });

      const written = chrome.storage.sync.set.mock.calls[0][0].user_preferences;
      expect(written.summaryLength).toBe('long');
      expect(written.summaryType).toBe('key-points');
      expect(written.updatedAt).toEqual(expect.any(Number));
    });
  });

  describe('createAIClient', () => {
    it('builds a client for the selected provider using the stored key', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          initialized: true,
          preferredProvider: 'openai',
          apiKeys: { openai: 'sk-openai' },
          models: { openai: 'gpt-test' }
        }
      });

      const client = await configManager.createAIClient();

      expect(client.provider).toBe('openai');
      expect(client.apiKey).toBe('sk-openai');
      expect(client.model).toBe('gpt-test');
    });

    it('refuses to run when the selected provider has no key', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: { initialized: true, preferredProvider: 'gemini', apiKeys: {} }
      });

      await expect(configManager.createAIClient()).rejects.toBeInstanceOf(AIError);
      await expect(configManager.createAIClient()).rejects.toMatchObject({
        code: 'MISSING_API_KEY'
      });
    });

    it('does not silently substitute a different provider that does have a key', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          initialized: true,
          preferredProvider: 'gemini',
          apiKeys: { openai: 'sk-openai' }
        }
      });

      await expect(configManager.createAIClient()).rejects.toMatchObject({
        code: 'MISSING_API_KEY'
      });
    });
  });

  describe('getProviderStatus', () => {
    it('reports which providers are configured', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          initialized: true,
          preferredProvider: 'anthropic',
          apiKeys: { anthropic: 'sk-ant' }
        }
      });

      const status = await configManager.getProviderStatus();

      expect(status).toMatchObject({ provider: 'anthropic', configured: true });
      expect(status.providers).toEqual({ anthropic: true, openai: false, gemini: false });
    });
  });
});
