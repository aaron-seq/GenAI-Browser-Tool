import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurationManager } from '../../core/configuration-manager.js';

describe('ConfigurationManager', () => {
  /** @type {ConfigurationManager} */
  let configManager;

  beforeEach(() => {
    configManager = new ConfigurationManager();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', async () => {
      await configManager.initialize();
      const preferences = await configManager.getUserPreferences();
      expect(preferences.initialized).toBe(true);
    });

    it('should load saved preferences on initialization', async () => {
      const mockPreferences = {
        aiProvider: 'openai',
        summaryLength: 'medium',
        language: 'en'
      };
      
      chrome.storage.sync.get.mockResolvedValue({ user_preferences: mockPreferences });
      
      await configManager.initialize();
      const preferences = await configManager.getUserPreferences();
      
      expect(preferences).toEqual(expect.objectContaining(mockPreferences));
    });
  });

  describe('preference management', () => {
    it('should update user preferences', async () => {
      const newPreferences = {
        aiProvider: 'claude',
        summaryLength: 'long'
      };
      
      await configManager.updateUserPreferences(newPreferences);
      
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        user_preferences: expect.objectContaining({
          ...newPreferences,
          updatedAt: expect.any(Number)
        })
      });
    });

    it.skip('should validate preference values', async () => {
      const invalidPreferences = {
        aiProvider: 'invalid-provider',
        summaryLength: 'invalid-length'
      };
      
      await expect(configManager.updateUserPreferences(invalidPreferences))
        .rejects.toThrow('Invalid preference values');
    });

    it('should merge new preferences with existing ones', async () => {
      const existingPreferences = {
        aiProvider: 'openai',
        summaryLength: 'medium',
        language: 'en'
      };
      
      const newPreferences = {
        summaryLength: 'long'
      };
      
      chrome.storage.sync.get.mockResolvedValue({ user_preferences: existingPreferences });
      
      await configManager.updateUserPreferences(newPreferences);
      
      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        user_preferences: {
          ...existingPreferences,
          ...newPreferences,
          updatedAt: expect.any(Number)
        }
      });
    });
  });

  describe('default values', () => {
    it('should return default preferences when none are saved', async () => {
      chrome.storage.sync.get.mockResolvedValue({});
      
      const preferences = await configManager.getUserPreferences();
      
      expect(preferences).toEqual(expect.objectContaining({
        preferredProvider: expect.any(String),
        summaryLength: expect.any(String),
        language: expect.any(String)
      }));
    });
  });
});