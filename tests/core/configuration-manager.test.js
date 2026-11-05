import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurationManager } from '../../core/configuration-manager.js';
import { AIError } from '../../providers/ai-client.js';

/** Back reads and writes with cloned data, as Chrome storage does. */
function givenStorage(preferences) {
  const stored = preferences
    ? { user_preferences: structuredClone(preferences) }
    : {};
  chrome.storage.sync.get.mockImplementation(async () =>
    structuredClone(stored)
  );
  chrome.storage.sync.set.mockImplementation(async values => {
    Object.assign(stored, structuredClone(values));
  });
  return stored;
}

describe('ConfigurationManager', () => {
  /** @type {ConfigurationManager} */
  let configManager;

  beforeEach(() => {
    configManager = new ConfigurationManager();
    vi.clearAllMocks();
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.sync.set.mockReset().mockResolvedValue(undefined);
  });

  describe('serialized settings writes', () => {
    it('keeps overlapping top-level and nested edits', async () => {
      const stored = givenStorage({ apiKeys: { anthropic: 'fixture-key' } });
      await Promise.all([
        configManager.updateUserPreferences({ theme: 'dark' }),
        configManager.updateUserPreferences({ summaryType: 'tldr' }),
        configManager.updateUserPreferences({
          models: { openai: 'fixture-openai' },
        }),
        configManager.updateUserPreferences({
          models: { gemini: 'fixture-gemini' },
        }),
        configManager.updateUserPreferences({
          features: { notifications: false },
        }),
        configManager.updateUserPreferences({
          features: { saveHistory: false },
        }),
        configManager.updateUserPreferences({
          apiKeys: { openai: 'fixture-other-key' },
        }),
      ]);
      expect(stored.user_preferences).toMatchObject({
        theme: 'dark',
        summaryType: 'tldr',
        models: { openai: 'fixture-openai', gemini: 'fixture-gemini' },
        features: { notifications: false, saveHistory: false },
        apiKeys: { anthropic: 'fixture-key', openai: 'fixture-other-key' },
      });
    });

    it('finishes first-run initialization before applying an overlapping edit', async () => {
      const stored = givenStorage();
      let finishRead;
      chrome.storage.sync.get.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishRead = () => resolve({});
          })
      );
      const initialization = configManager.initialize();
      await vi.waitFor(() =>
        expect(chrome.storage.sync.get).toHaveBeenCalledOnce()
      );
      const update = configManager.updateUserPreferences({ theme: 'dark' });
      await new Promise(resolve => setTimeout(resolve, 0));
      finishRead();
      await Promise.all([initialization, update]);
      expect(stored.user_preferences.theme).toBe('dark');
    });

    it('orders a reset between overlapping edits without restoring cleared keys', async () => {
      const original = {
        apiKeys: { openai: 'fixture-old-key' },
        theme: 'light',
      };
      const stored = givenStorage(original);
      let finishRead;
      chrome.storage.sync.get.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finishRead = () =>
              resolve({ user_preferences: structuredClone(original) });
          })
      );
      const first = configManager.updateUserPreferences({
        features: { notifications: false },
      });
      await vi.waitFor(() =>
        expect(chrome.storage.sync.get).toHaveBeenCalledOnce()
      );
      const reset = configManager.setUserPreferences(
        configManager.defaultSettings
      );
      const last = configManager.updateUserPreferences({ theme: 'dark' });
      await new Promise(resolve => setTimeout(resolve, 0));
      finishRead();
      await Promise.all([first, reset, last]);
      expect(stored.user_preferences).toMatchObject({
        apiKeys: {},
        theme: 'dark',
        features: { notifications: true },
      });
      expect(stored.user_preferences.apiKeys).toEqual({});
    });

    it.each(['read', 'write'])(
      'recovers queued edits after a failed %s',
      async failure => {
        const stored = givenStorage({ theme: 'light' });
        if (failure === 'read')
          chrome.storage.sync.get.mockRejectedValueOnce(
            new Error('fixture failure')
          );
        else
          chrome.storage.sync.set.mockRejectedValueOnce(
            new Error('fixture failure')
          );
        const first = configManager.updateUserPreferences({
          summaryType: 'tldr',
        });
        const rejected = expect(first).rejects.toMatchObject({
          message:
            failure === 'read'
              ? 'Saved settings are unavailable. Try again.'
              : 'fixture failure',
        });
        const later = configManager.updateUserPreferences({ theme: 'dark' });
        await Promise.all([rejected, later]);
        expect(stored.user_preferences.theme).toBe('dark');
        expect(stored.user_preferences.summaryType).toBe('key-points');
      }
    );

    it('recovers queued edits after a failed initialization or replacement', async () => {
      const stored = givenStorage({ apiKeys: { openai: 'fixture-key' } });
      chrome.storage.sync.get.mockRejectedValueOnce(
        new Error('initialization failed')
      );
      const initialization = configManager.initialize();
      const rejectedInitialization = expect(initialization).rejects.toThrow(
        'initialization failed'
      );
      chrome.storage.sync.set.mockRejectedValueOnce(
        new Error('replacement failed')
      );
      const replacement = configManager.setUserPreferences(
        configManager.defaultSettings
      );
      const rejectedReplacement =
        expect(replacement).rejects.toThrow('replacement failed');
      const later = configManager.updateUserPreferences({ theme: 'dark' });
      await Promise.all([rejectedInitialization, rejectedReplacement, later]);
      expect(stored.user_preferences).toMatchObject({
        theme: 'dark',
        apiKeys: { openai: 'fixture-key' },
      });
    });
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
        user_preferences: configManager.defaultSettings,
      });
    });

    it('does not overwrite settings that already exist', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: { initialized: true, preferredProvider: 'openai' },
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
        user_preferences: { initialized: true, preferredProvider: 'openai' },
      });

      const prefs = await configManager.getUserPreferences();

      expect(prefs.preferredProvider).toBe('openai');
      expect(prefs.features).toBeDefined();
      expect(prefs.apiKeys).toEqual({});
      expect(prefs.models).toEqual({});
    });

    it('distinguishes unavailable settings from a new installation', async () => {
      const logs = vi.spyOn(console, 'error');
      chrome.storage.sync.get.mockRejectedValue(
        new Error('fixture-private-storage-detail')
      );
      try {
        await expect(configManager.getUserPreferences()).rejects.toMatchObject({
          code: 'SETTINGS_UNAVAILABLE',
          message: 'Saved settings are unavailable. Try again.',
        });
        expect(JSON.stringify(logs.mock.calls)).not.toContain(
          'fixture-private-storage-detail'
        );
      } finally {
        logs.mockRestore();
      }
    });
  });

  describe('updating settings', () => {
    it('does not replace saved preferences after a failed read and can recover', async () => {
      const stored = {
        preferredProvider: 'openai',
        apiKeys: { openai: 'fixture-key' },
        features: { notifications: false },
      };
      chrome.storage.sync.get
        .mockRejectedValueOnce(new Error('storage unavailable'))
        .mockResolvedValue({ user_preferences: stored });
      await expect(
        configManager.updateUserPreferences({ theme: 'dark' })
      ).rejects.toMatchObject({ code: 'SETTINGS_UNAVAILABLE' });
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      await configManager.updateUserPreferences({ theme: 'dark' });
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        user_preferences: expect.objectContaining({
          ...stored,
          features: expect.objectContaining(stored.features),
          theme: 'dark',
        }),
      });
    });

    it('merges nested apiKeys instead of replacing the whole map', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          initialized: true,
          apiKeys: { openai: 'sk-openai' },
        },
      });

      await configManager.updateUserPreferences({
        apiKeys: { anthropic: 'sk-ant' },
      });

      const written = chrome.storage.sync.set.mock.calls[0][0].user_preferences;
      expect(written.apiKeys).toEqual({
        openai: 'sk-openai',
        anthropic: 'sk-ant',
      });
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
          models: { openai: 'gpt-test' },
        },
      });

      const client = await configManager.createAIClient();

      expect(client.provider).toBe('openai');
      expect(client.apiKey).toBe('sk-openai');
      expect(client.model).toBe('gpt-test');
    });

    it('refuses to run when the selected provider has no key', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          initialized: true,
          preferredProvider: 'gemini',
          apiKeys: {},
        },
      });

      await expect(configManager.createAIClient()).rejects.toBeInstanceOf(
        AIError
      );
      await expect(configManager.createAIClient()).rejects.toMatchObject({
        code: 'MISSING_API_KEY',
      });
    });

    it('does not silently substitute a different provider that does have a key', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          initialized: true,
          preferredProvider: 'gemini',
          apiKeys: { openai: 'sk-openai' },
        },
      });

      await expect(configManager.createAIClient()).rejects.toMatchObject({
        code: 'MISSING_API_KEY',
      });
    });
  });

  describe('getProviderStatus', () => {
    it('reports which providers are configured', async () => {
      chrome.storage.sync.get.mockResolvedValue({
        user_preferences: {
          initialized: true,
          preferredProvider: 'anthropic',
          apiKeys: { anthropic: 'sk-ant' },
        },
      });

      const status = await configManager.getProviderStatus();

      expect(status).toMatchObject({ provider: 'anthropic', configured: true });
      expect(status.providers).toEqual({
        anthropic: true,
        openai: false,
        gemini: false,
      });
    });
  });
});
