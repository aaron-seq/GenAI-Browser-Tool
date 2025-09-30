/**
 * @file services/storage-service.js
 * @description Advanced storage management with data organization and cleanup
 */

export class StorageService {
  constructor() {
    this.storageQuota = {
      summaryHistory: 1000,
      conversationHistory: 500,
      bookmarks: 2000,
      userPreferences: 1
    };
    
    this.dataSchemaVersion = '4.0.0';
  }

  async saveSummaryHistory(summaryData) {
    const storageKey = 'genai_summary_history';
    const existingData = await this.getStorageData(storageKey, []);
    
    const enhancedSummaryData = {
      id: this.generateUniqueId(),
      ...summaryData,
      schemaVersion: this.dataSchemaVersion
    };
    
    existingData.unshift(enhancedSummaryData);
    
    // Maintain quota
    if (existingData.length > this.storageQuota.summaryHistory) {
      existingData.splice(this.storageQuota.summaryHistory);
    }
    
    await this.setStorageData(storageKey, existingData);
    return enhancedSummaryData.id;
  }

  async updateConversationHistory(conversationData) {
    const storageKey = 'genai_conversation_history';
    const existingData = await this.getStorageData(storageKey, []);
    
    const enhancedConversationData = {
      id: this.generateUniqueId(),
      ...conversationData,
      schemaVersion: this.dataSchemaVersion
    };
    
    existingData.unshift(enhancedConversationData);
    
    // Maintain quota
    if (existingData.length > this.storageQuota.conversationHistory) {
      existingData.splice(this.storageQuota.conversationHistory);
    }
    
    await this.setStorageData(storageKey, existingData);
    return enhancedConversationData.id;
  }

  async saveIntelligentBookmark(bookmarkData) {
    const storageKey = 'genai_smart_bookmarks';
    const existingBookmarks = await this.getStorageData(storageKey, []);
    
    const enhancedBookmark = {
      id: this.generateUniqueId(),
      ...bookmarkData,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
      schemaVersion: this.dataSchemaVersion
    };
    
    // Check for duplicates
    const existingIndex = existingBookmarks.findIndex(
      bookmark => bookmark.url === bookmarkData.url
    );
    
    if (existingIndex >= 0) {
      existingBookmarks[existingIndex] = {
        ...existingBookmarks[existingIndex],
        ...enhancedBookmark,
        id: existingBookmarks[existingIndex].id,
        createdAt: existingBookmarks[existingIndex].createdAt,
        accessCount: existingBookmarks[existingIndex].accessCount + 1
      };
    } else {
      existingBookmarks.unshift(enhancedBookmark);
    }
    
    // Maintain quota
    if (existingBookmarks.length > this.storageQuota.bookmarks) {
      existingBookmarks.splice(this.storageQuota.bookmarks);
    }
    
    await this.setStorageData(storageKey, existingBookmarks);
    return enhancedBookmark.id;
  }

  async getUserPreferences() {
    const defaultPreferences = {
      aiProvider: 'chrome-ai',
      summaryLength: 'medium',
      summaryType: 'key-points',
      autoAnalysis: false,
      notifications: true,
      theme: 'auto',
      language: 'en',
      apiKeys: {},
      advancedFeatures: {
        contextAwareness: true,
        smartBookmarks: true,
        analyticsTracking: false
      },
      schemaVersion: this.dataSchemaVersion
    };
    
    return await this.getStorageData('genai_user_preferences', defaultPreferences);
  }

  async updateUserPreferences(newPreferences) {
    const currentPreferences = await this.getUserPreferences();
    const updatedPreferences = {
      ...currentPreferences,
      ...newPreferences,
      updatedAt: Date.now(),
      schemaVersion: this.dataSchemaVersion
    };
    
    await this.setStorageData('genai_user_preferences', updatedPreferences);
    return updatedPreferences;
  }

  async getAllBookmarks() {
    return await this.getStorageData('genai_smart_bookmarks', []);
  }

  async getAnalysisHistory() {
    const summaryHistory = await this.getStorageData('genai_summary_history', []);
    const conversationHistory = await this.getStorageData('genai_conversation_history', []);
    
    return {
      summaries: summaryHistory,
      conversations: conversationHistory,
      totalItems: summaryHistory.length + conversationHistory.length
    };
  }

  async cleanupOldData() {
    const cutoffDate = Date.now() - (90 * 24 * 60 * 60 * 1000); // 90 days ago
    
    // Cleanup old summaries
    const summaryHistory = await this.getStorageData('genai_summary_history', []);
    const filteredSummaries = summaryHistory.filter(item => item.timestamp > cutoffDate);
    await this.setStorageData('genai_summary_history', filteredSummaries);
    
    // Cleanup old conversations
    const conversationHistory = await this.getStorageData('genai_conversation_history', []);
    const filteredConversations = conversationHistory.filter(item => item.timestamp > cutoffDate);
    await this.setStorageData('genai_conversation_history', filteredConversations);
    
    // Cleanup unused bookmarks (not accessed in 180 days)
    const longCutoffDate = Date.now() - (180 * 24 * 60 * 60 * 1000);
    const bookmarks = await this.getStorageData('genai_smart_bookmarks', []);
    const activeBookmarks = bookmarks.filter(bookmark => 
      bookmark.lastAccessed > longCutoffDate || bookmark.accessCount > 5
    );
    await this.setStorageData('genai_smart_bookmarks', activeBookmarks);
    
    console.log('Data cleanup completed', {
      summariesRemoved: summaryHistory.length - filteredSummaries.length,
      conversationsRemoved: conversationHistory.length - filteredConversations.length,
      bookmarksRemoved: bookmarks.length - activeBookmarks.length
    });
  }

  async exportUserData(options = {}) {
    const { includeApiKeys = false, format = 'json' } = options;
    
    const userData = {
      summaryHistory: await this.getStorageData('genai_summary_history', []),
      conversationHistory: await this.getStorageData('genai_conversation_history', []),
      bookmarks: await this.getStorageData('genai_smart_bookmarks', []),
      preferences: await this.getUserPreferences(),
      exportedAt: Date.now(),
      version: this.dataSchemaVersion
    };
    
    // Remove sensitive data if requested
    if (!includeApiKeys && userData.preferences.apiKeys) {
      userData.preferences = { ...userData.preferences };
      delete userData.preferences.apiKeys;
    }
    
    return format === 'json' ? JSON.stringify(userData, null, 2) : userData;
  }

  async importUserData(importData) {
    try {
      const data = typeof importData === 'string' ? JSON.parse(importData) : importData;
      
      // Validate data structure
      if (!data.version || !data.exportedAt) {
        throw new Error('Invalid import data format');
      }
      
      // Import with user confirmation for each data type
      const importResults = {
        summaries: 0,
        conversations: 0,
        bookmarks: 0,
        preferences: false
      };
      
      if (data.summaryHistory) {
        await this.setStorageData('genai_summary_history', data.summaryHistory);
        importResults.summaries = data.summaryHistory.length;
      }
      
      if (data.conversationHistory) {
        await this.setStorageData('genai_conversation_history', data.conversationHistory);
        importResults.conversations = data.conversationHistory.length;
      }
      
      if (data.bookmarks) {
        await this.setStorageData('genai_smart_bookmarks', data.bookmarks);
        importResults.bookmarks = data.bookmarks.length;
      }
      
      if (data.preferences) {
        await this.setStorageData('genai_user_preferences', {
          ...data.preferences,
          schemaVersion: this.dataSchemaVersion,
          importedAt: Date.now()
        });
        importResults.preferences = true;
      }
      
      return importResults;
    } catch (error) {
      throw new Error(`Import failed: ${error.message}`);
    }
  }

  async getStorageData(key, defaultValue = null) {
    try {
      const result = await chrome.storage.local.get([key]);
      return result[key] ?? defaultValue;
    } catch (error) {
      console.error(`Failed to get storage data for key: ${key}`, error);
      return defaultValue;
    }
  }

  async setStorageData(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`Failed to set storage data for key: ${key}`, error);
      throw error;
    }
  }

  generateUniqueId() {
    return `genai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getStorageUsage() {
    const usage = await chrome.storage.local.getBytesInUse();
    const quota = chrome.storage.local.QUOTA_BYTES;
    
    return {
      used: usage,
      total: quota,
      percentage: (usage / quota * 100).toFixed(2),
      available: quota - usage
    };
  }
}
