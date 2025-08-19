// GenAI Browser Tool - Storage Manager
// Advanced storage management for extension data

export class StorageManager {
  constructor() {
    this.storageKeys = {
      SETTINGS: 'genai_settings',
      BOOKMARKS: 'genai_bookmarks',
      HISTORY: 'genai_analysis_history',
      CACHE: 'genai_cache',
      USER_DATA: 'genai_user_data'
    };
    
    this.defaultSettings = {
      initialized: true,
      version: '3.0.0',
      preferredProvider: 'chrome-ai', // chrome-ai, openai, anthropic, gemini
      preferredModel: 'auto',
      apiKeys: {
        openai: '',
        anthropic: '',
        gemini: ''
      },
      summarization: {
        defaultType: 'key-points', // key-points, tldr, teaser, headline
        defaultLength: 'medium', // short, medium, long
        defaultFormat: 'markdown' // markdown, plain-text
      },
      ui: {
        theme: 'auto', // light, dark, auto
        language: 'en',
        compactMode: false,
        showReadingTime: true,
        showWordCount: true
      },
      features: {
        autoAnalysis: false,
        smartBookmarks: true,
        contextMenus: true,
        notifications: true,
        keyboard shortcuts: true
      },
      privacy: {
        storeHistory: true,
        encryptSensitiveData: true,
        anonymizeData: false
      },
      performance: {
        cacheResults: true,
        maxCacheSize: 50, // MB
        maxHistoryEntries: 1000
      }
    };
  }

  // Initialize default settings
  async initializeDefaults() {
    try {
      await chrome.storage.local.set({
        [this.storageKeys.SETTINGS]: this.defaultSettings,
        [this.storageKeys.BOOKMARKS]: [],
        [this.storageKeys.HISTORY]: [],
        [this.storageKeys.CACHE]: {},
        [this.storageKeys.USER_DATA]: {
          installDate: Date.now(),
          totalUsage: 0,
          lastUsed: Date.now()
        }
      });
      
      console.log('Default settings initialized');
    } catch (error) {
      console.error('Error initializing defaults:', error);
      throw error;
    }
  }

  // Get current settings
  async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.storageKeys.SETTINGS);
      const settings = result[this.storageKeys.SETTINGS] || this.defaultSettings;
      
      // Merge with defaults to ensure all properties exist
      return this.mergeSettings(this.defaultSettings, settings);
    } catch (error) {
      console.error('Error getting settings:', error);
      return this.defaultSettings;
    }
  }

  // Update settings
  async updateSettings(newSettings) {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings = this.mergeSettings(currentSettings, newSettings);
      
      await chrome.storage.local.set({
        [this.storageKeys.SETTINGS]: updatedSettings
      });
      
      console.log('Settings updated successfully');
      return updatedSettings;
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  }

  // Merge settings objects deeply
  mergeSettings(defaults, updates) {
    const merged = JSON.parse(JSON.stringify(defaults));
    
    for (const key in updates) {
      if (updates.hasOwnProperty(key)) {
        if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key])) {
          merged[key] = this.mergeSettings(merged[key] || {}, updates[key]);
        } else {
          merged[key] = updates[key];
        }
      }
    }
    
    return merged;
  }

  // Save bookmark
  async saveBookmark(bookmark) {
    try {
      const bookmarks = await this.getAllBookmarks();
      
      // Check if bookmark already exists (by URL)
      const existingIndex = bookmarks.findIndex(b => b.url === bookmark.url);
      
      if (existingIndex !== -1) {
        // Update existing bookmark
        bookmarks[existingIndex] = { ...bookmarks[existingIndex], ...bookmark };
      } else {
        // Add new bookmark
        bookmarks.push(bookmark);
      }
      
      // Sort by timestamp (newest first)
      bookmarks.sort((a, b) => b.timestamp - a.timestamp);
      
      await chrome.storage.local.set({
        [this.storageKeys.BOOKMARKS]: bookmarks
      });
      
      return bookmark;
    } catch (error) {
      console.error('Error saving bookmark:', error);
      throw error;
    }
  }

  // Get all bookmarks
  async getAllBookmarks() {
    try {
      const result = await chrome.storage.local.get(this.storageKeys.BOOKMARKS);
      return result[this.storageKeys.BOOKMARKS] || [];
    } catch (error) {
      console.error('Error getting bookmarks:', error);
      return [];
    }
  }

  // Delete bookmark
  async deleteBookmark(bookmarkId) {
    try {
      const bookmarks = await this.getAllBookmarks();
      const filteredBookmarks = bookmarks.filter(b => b.id !== bookmarkId);
      
      await chrome.storage.local.set({
        [this.storageKeys.BOOKMARKS]: filteredBookmarks
      });
      
      return true;
    } catch (error) {
      console.error('Error deleting bookmark:', error);
      throw error;
    }
  }

  // Search bookmarks
  async searchBookmarks(query) {
    try {
      const bookmarks = await this.getAllBookmarks();
      const lowercaseQuery = query.toLowerCase();
      
      return bookmarks.filter(bookmark => 
        bookmark.title.toLowerCase().includes(lowercaseQuery) ||
        bookmark.content.toLowerCase().includes(lowercaseQuery) ||
        bookmark.url.toLowerCase().includes(lowercaseQuery) ||
        (bookmark.tags && bookmark.tags.some(tag => 
          tag.toLowerCase().includes(lowercaseQuery)
        ))
      );
    } catch (error) {
      console.error('Error searching bookmarks:', error);
      return [];
    }
  }

  // Save analysis to history
  async saveAnalysisHistory(analysis) {
    try {
      const history = await this.getAnalysisHistory();
      
      // Add new analysis
      history.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        ...analysis,
        timestamp: Date.now()
      });
      
      // Limit history size
      const settings = await this.getSettings();
      const maxEntries = settings.performance.maxHistoryEntries;
      
      if (history.length > maxEntries) {
        history.splice(maxEntries);
      }
      
      await chrome.storage.local.set({
        [this.storageKeys.HISTORY]: history
      });
      
      return true;
    } catch (error) {
      console.error('Error saving analysis history:', error);
      throw error;
    }
  }

  // Get analysis history
  async getAnalysisHistory(limit = null) {
    try {
      const result = await chrome.storage.local.get(this.storageKeys.HISTORY);
      let history = result[this.storageKeys.HISTORY] || [];
      
      if (limit) {
        history = history.slice(0, limit);
      }
      
      return history;
    } catch (error) {
      console.error('Error getting analysis history:', error);
      return [];
    }
  }

  // Clear analysis history
  async clearAnalysisHistory() {
    try {
      await chrome.storage.local.set({
        [this.storageKeys.HISTORY]: []
      });
      return true;
    } catch (error) {
      console.error('Error clearing analysis history:', error);
      throw error;
    }
  }

  // Save page analysis
  async savePageAnalysis(url, analysis) {
    try {
      await this.saveAnalysisHistory({
        type: 'page_analysis',
        url,
        ...analysis
      });
    } catch (error) {
      console.error('Error saving page analysis:', error);
    }
  }

  // Cache management
  async setCacheItem(key, value, ttl = 3600000) { // Default TTL: 1 hour
    try {
      const cache = await this.getCache();
      cache[key] = {
        value,
        timestamp: Date.now(),
        ttl
      };
      
      await chrome.storage.local.set({
        [this.storageKeys.CACHE]: cache
      });
      
      // Clean up expired items
      await this.cleanupCache();
      
    } catch (error) {
      console.error('Error setting cache item:', error);
    }
  }

  async getCacheItem(key) {
    try {
      const cache = await this.getCache();
      const item = cache[key];
      
      if (!item) return null;
      
      // Check if item has expired
      if (Date.now() - item.timestamp > item.ttl) {
        delete cache[key];
        await chrome.storage.local.set({
          [this.storageKeys.CACHE]: cache
        });
        return null;
      }
      
      return item.value;
    } catch (error) {
      console.error('Error getting cache item:', error);
      return null;
    }
  }

  async getCache() {
    try {
      const result = await chrome.storage.local.get(this.storageKeys.CACHE);
      return result[this.storageKeys.CACHE] || {};
    } catch (error) {
      console.error('Error getting cache:', error);
      return {};
    }
  }

  async cleanupCache() {
    try {
      const cache = await this.getCache();
      const now = Date.now();
      let hasExpiredItems = false;
      
      for (const key in cache) {
        const item = cache[key];
        if (now - item.timestamp > item.ttl) {
          delete cache[key];
          hasExpiredItems = true;
        }
      }
      
      if (hasExpiredItems) {
        await chrome.storage.local.set({
          [this.storageKeys.CACHE]: cache
        });
      }
    } catch (error) {
      console.error('Error cleaning up cache:', error);
    }
  }

  async clearCache() {
    try {
      await chrome.storage.local.set({
        [this.storageKeys.CACHE]: {}
      });
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      throw error;
    }
  }

  // User data tracking
  async updateUserData(updates) {
    try {
      const result = await chrome.storage.local.get(this.storageKeys.USER_DATA);
      const userData = result[this.storageKeys.USER_DATA] || {};
      
      const updatedUserData = {
        ...userData,
        ...updates,
        lastUsed: Date.now()
      };
      
      await chrome.storage.local.set({
        [this.storageKeys.USER_DATA]: updatedUserData
      });
      
      return updatedUserData;
    } catch (error) {
      console.error('Error updating user data:', error);
      throw error;
    }
  }

  async getUserData() {
    try {
      const result = await chrome.storage.local.get(this.storageKeys.USER_DATA);
      return result[this.storageKeys.USER_DATA] || {};
    } catch (error) {
      console.error('Error getting user data:', error);
      return {};
    }
  }

  // Export all data
  async exportAllData() {
    try {
      const data = {};
      
      // Get all storage data
      for (const [key, storageKey] of Object.entries(this.storageKeys)) {
        const result = await chrome.storage.local.get(storageKey);
        data[key] = result[storageKey];
      }
      
      // Remove sensitive information
      if (data.SETTINGS && data.SETTINGS.apiKeys) {
        data.SETTINGS = { ...data.SETTINGS };
        data.SETTINGS.apiKeys = {
          openai: data.SETTINGS.apiKeys.openai ? '[REDACTED]' : '',
          anthropic: data.SETTINGS.apiKeys.anthropic ? '[REDACTED]' : '',
          gemini: data.SETTINGS.apiKeys.gemini ? '[REDACTED]' : ''
        };
      }
      
      return {
        exportDate: new Date().toISOString(),
        version: '3.0.0',
        data
      };
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  }

  // Import data
  async importData(importData) {
    try {
      if (!importData.data) {
        throw new Error('Invalid import data format');
      }
      
      // Validate version compatibility
      const currentVersion = chrome.runtime.getManifest().version;
      console.log(`Importing data from version ${importData.version} to ${currentVersion}`);
      
      // Import each data type
      for (const [key, storageKey] of Object.entries(this.storageKeys)) {
        if (importData.data[key]) {
          await chrome.storage.local.set({
            [storageKey]: importData.data[key]
          });
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  }

  // Get storage usage statistics
  async getStorageStats() {
    try {
      const stats = {};
      
      for (const [key, storageKey] of Object.entries(this.storageKeys)) {
        const result = await chrome.storage.local.get(storageKey);
        const data = result[storageKey];
        
        if (data) {
          const jsonString = JSON.stringify(data);
          stats[key] = {
            size: new Blob([jsonString]).size,
            items: Array.isArray(data) ? data.length : (typeof data === 'object' ? Object.keys(data).length : 1)
          };
        } else {
          stats[key] = { size: 0, items: 0 };
        }
      }
      
      // Calculate total size
      stats.total = {
        size: Object.values(stats).reduce((sum, stat) => sum + stat.size, 0),
        items: Object.values(stats).reduce((sum, stat) => sum + stat.items, 0)
      };
      
      return stats;
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {};
    }
  }

  // Clean up storage
  async cleanupStorage() {
    try {
      const settings = await this.getSettings();
      const maxCacheSize = settings.performance.maxCacheSize * 1024 * 1024; // Convert MB to bytes
      
      // Clean up cache
      await this.cleanupCache();
      
      // Check cache size and clear if too large
      const stats = await this.getStorageStats();
      if (stats.CACHE && stats.CACHE.size > maxCacheSize) {
        await this.clearCache();
        console.log('Cache cleared due to size limit');
      }
      
      // Limit history entries
      const history = await this.getAnalysisHistory();
      if (history.length > settings.performance.maxHistoryEntries) {
        const limitedHistory = history.slice(0, settings.performance.maxHistoryEntries);
        await chrome.storage.local.set({
          [this.storageKeys.HISTORY]: limitedHistory
        });
        console.log(`History trimmed to ${settings.performance.maxHistoryEntries} entries`);
      }
      
      return true;
    } catch (error) {
      console.error('Error cleaning up storage:', error);
      throw error;
    }
  }

  // Backup data to local file
  async backupToFile() {
    try {
      const data = await this.exportAllData();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const filename = `genai-backup-${new Date().toISOString().split('T')[0]}.json`;
      
      // Download the file
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      return filename;
    } catch (error) {
      console.error('Error backing up to file:', error);
      throw error;
    }
  }

  // Restore from backup file
  async restoreFromFile(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      await this.importData(data);
      return true;
    } catch (error) {
      console.error('Error restoring from file:', error);
      throw error;
    }
  }

  // Reset all data
  async resetAllData() {
    try {
      await chrome.storage.local.clear();
      await this.initializeDefaults();
      return true;
    } catch (error) {
      console.error('Error resetting all data:', error);
      throw error;
    }
  }
}