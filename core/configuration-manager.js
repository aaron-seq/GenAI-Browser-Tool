/**
 * @file core/configuration-manager.js
 * @description Configuration and settings management
 */

export class ConfigurationManager {
  constructor() {
    this.defaultSettings = {
      preferredProvider: 'chrome-ai',
      summaryLength: 'medium',
      summaryType: 'key-points',
      autoAnalysis: false,
      notifications: true,
      theme: 'auto',
      language: 'en',
      apiKeys: {},
      initialized: true
    };
  }

  async initialize() {
    const settings = await this.getUserPreferences();
    if (!settings.initialized) {
      await this.setUserPreferences(this.defaultSettings);
    }
  }

  async getUserPreferences() {
    try {
      const result = await chrome.storage.sync.get(['user_preferences']);
      return result.user_preferences || this.defaultSettings;
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      return this.defaultSettings;
    }
  }

  async updateUserPreferences(newSettings) {
    try {
      const currentSettings = await this.getUserPreferences();
      const updatedSettings = {
        ...currentSettings,
        ...newSettings,
        updatedAt: Date.now()
      };
      
      await chrome.storage.sync.set({ user_preferences: updatedSettings });
      return updatedSettings;
    } catch (error) {
      console.error('Failed to update user preferences:', error);
      throw error;
    }
  }

  async setUserPreferences(settings) {
    try {
      await chrome.storage.sync.set({ user_preferences: settings });
    } catch (error) {
      console.error('Failed to set user preferences:', error);
      throw error;
    }
  }
}