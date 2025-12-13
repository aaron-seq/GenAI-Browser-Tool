/**
 * @file background.js
 * @description Enhanced service worker for GenAI Browser Assistant
 * @version 4.0.0
 */

import { ConfigurationManager } from './core/configuration-manager.js';
import { AIProviderOrchestrator } from './core/ai-provider-orchestrator.js';
import { ContentExtractor } from './services/content-extractor.js';
import { StorageService } from './services/storage-service.js';
import { NotificationManager } from './services/notification-manager.js';
import { AnalyticsTracker } from './services/analytics-tracker.js';
import { ValidationService } from './src/utils/validation-service.js';
import { ErrorHandler } from './src/utils/error-handler.js';
import { Logger } from './utils/logger.js';

class BackgroundServiceOrchestrator {
  constructor() {
    this.logger = new Logger('BackgroundService');
    this.configManager = new ConfigurationManager();
    this.aiOrchestrator = new AIProviderOrchestrator();
    this.contentExtractor = new ContentExtractor();
    this.storageService = new StorageService();
    this.notificationManager = new NotificationManager();
    this.analyticsTracker = new AnalyticsTracker();
    this.securityValidator = new ValidationService();
    this.errorHandler = new ErrorHandler();
    
    this.isInitialized = false;
    this.initializeService();
  }

  async initializeService() {
    try {
      this.logger.info('Initializing GenAI Browser Assistant...');
      
      await this.configManager.initialize();
      await this.setupEventListeners();
      await this.createContextMenus();
      await this.setupPeriodicTasks();
      
      this.isInitialized = true;
      this.logger.info('Service initialization completed successfully');
    } catch (error) {
      /** @type {any} */
      const err = error;
      this.errorHandler.handleCriticalError(err, 'Service initialization failed');
    }
  }

  async setupEventListeners() {
    // Installation and update handling
    chrome.runtime.onInstalled.addListener(this.handleInstallation.bind(this));
    
    // Message handling with improved error handling
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleIncomingMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Context menu interactions
    chrome.contextMenus.onClicked.addListener(this.handleContextMenuAction.bind(this));
    
    // Keyboard shortcuts
    chrome.commands.onCommand.addListener(this.handleKeyboardCommand.bind(this));
    
    // Tab lifecycle events
    chrome.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
    chrome.tabs.onActivated.addListener(this.handleTabActivation.bind(this));
    
    // Storage changes
    chrome.storage.onChanged.addListener(this.handleStorageChange.bind(this));
  }

  /** 
   * @param {any} message 
   * @param {chrome.runtime.MessageSender} sender 
   * @param {function} sendResponse 
   */
  async handleIncomingMessage(message, sender, sendResponse) {
    const startTime = performance.now();
    
    try {
      // Security validation
      if (!this.securityValidator.validateMessage(message, sender)) {
        throw new Error('Invalid message or sender');
      }

      const { actionType, requestId, payload } = message;
      // @ts-ignore - logger context type mismatch
      this.logger.debug(`Processing action: ${actionType}`, { requestId });

      let responseData;
      
      switch (actionType) {
        case 'GENERATE_CONTENT_SUMMARY':
          responseData = await this.processContentSummary(payload);
          break;
          
        case 'ANSWER_CONTEXTUAL_QUESTION':
          responseData = await this.processContextualQuestion(payload);
          break;
          
        case 'TRANSLATE_CONTENT':
          responseData = await this.processContentTranslation(payload);
          break;
          
        case 'ANALYZE_SENTIMENT':
          responseData = await this.processSentimentAnalysis(payload);
          break;
          
        case 'EXTRACT_PAGE_CONTENT':
          // @ts-ignore - tab id check
          responseData = await this.extractPageContent(sender.tab?.id || 0, payload);
          break;
          
        case 'SAVE_SMART_BOOKMARK':
          responseData = await this.createIntelligentBookmark(payload);
          break;
          
        case 'GET_USER_PREFERENCES':
          responseData = await this.configManager.getUserPreferences();
          break;
          
        case 'UPDATE_USER_PREFERENCES':
          responseData = await this.configManager.updateUserPreferences(payload);
          break;
          
        case 'EXPORT_USER_DATA':
          responseData = await this.exportUserData(payload);
          break;
          
        case 'IMPORT_USER_DATA':
          responseData = await this.importUserData(payload);
          break;
          
        default:
          throw new Error(`Unsupported action type: ${actionType}`);
      }

      const processingTime = performance.now() - startTime;
      // @ts-ignore - stub method
      this.analyticsTracker.trackActionPerformance(actionType, processingTime);

      sendResponse({
        success: true,
        data: responseData,
        requestId,
        processingTime: Math.round(processingTime)
      });

    } catch (error) {
      /** @type {any} */
      const err = error;
      
      const processingTime = performance.now() - startTime;
      this.errorHandler.handleError(err, 'Message processing failed', {
        action: message.actionType,
        requestId: message.requestId,
        processingTime
      });

      sendResponse({
        success: false,
        error: err.message,
        errorCode: err.code || 'UNKNOWN_ERROR',
        requestId: message.requestId,
        processingTime: Math.round(processingTime)
      });
    }
  }

  /** @param {any} payload */
  async processContentSummary(payload) {
    const { content, summaryType, targetLength, customPrompt } = payload;
    
    if (!content || content.trim().length === 0) {
      throw new Error('No content provided for summarization');
    }

    const aiProvider = await this.aiOrchestrator.getOptimalProvider();
    const summaryOptions = {
      type: summaryType || 'key-points',
      length: targetLength || 'medium',
      customPrompt: customPrompt,
      maxTokens: this.calculateMaxTokens(targetLength)
    };

    const summary = await aiProvider.generateSummary(content, summaryOptions);
    
    // Store summary for user history
    await this.storageService.saveSummaryHistory({
      originalContent: content.substring(0, 500),
      // @ts-ignore - summary might be string or object depending on provider
      summary,
      options: summaryOptions,
      provider: aiProvider.name,
      timestamp: Date.now()
    });

    return {
      summary,
      provider: aiProvider.name,
      // @ts-ignore - confidence property existence check
      confidence: summary.confidence || 0.95,
      processingStats: {
        inputLength: content.length,
        outputLength: typeof summary === 'string' ? summary.length : 0,
        // @ts-ignore
        compressionRatio: (typeof summary === 'string' && content.length > 0) ? (summary.length / content.length).toFixed(2) : '0.00'
      }
    };
  }

  /** @param {any} payload */
  async processContextualQuestion(payload) {
    const { question, context, conversationHistory } = payload;
    
    const aiProvider = await this.aiOrchestrator.getOptimalProvider();
    const answer = await aiProvider.answerQuestion(question, {
      context,
      conversationHistory: conversationHistory || [],
      includeSourceReferences: true
    });

    // Update conversation history
    await this.storageService.updateConversationHistory({
      question,
      answer,
      context: context.substring(0, 200),
      timestamp: Date.now()
    });

    return {
      answer,
      provider: aiProvider.name,
      confidence: answer.confidence || 0.9,
      sourceReferences: answer.sourceReferences || []
    };
  }

  async createContextMenus() {
    await chrome.contextMenus.removeAll();
    
    /** @type {chrome.contextMenus.CreateProperties[]} */
    const contextMenuItems = [
      {
        id: 'genai-summarize-selection',
        title: '🤖 Summarize selected text',
        contexts: ['selection']
      },
      {
        id: 'genai-explain-selection',
        title: '🧠 Explain this concept',
        contexts: ['selection']
      },
      {
        id: 'genai-translate-selection',
        title: '🌐 Translate selection',
        contexts: ['selection']
      },
      {
        id: 'genai-analyze-sentiment',
        title: '😊 Analyze sentiment',
        contexts: ['selection']
      },
      { type: 'separator', id: 'separator-1', contexts: ['page'] },
      {
        id: 'genai-summarize-page',
        title: '📄 Summarize entire page',
        contexts: ['page']
      },
      {
        id: 'genai-extract-insights',
        title: '💡 Extract key insights',
        contexts: ['page']
      },
      {
        id: 'genai-generate-tags',
        title: '🏷️ Generate smart tags',
        contexts: ['page']
      }
    ];

    contextMenuItems.forEach(item => chrome.contextMenus.create(item));
    this.logger.info('Context menus created successfully');
  }

  /** 
   * @param {chrome.contextMenus.OnClickData} info 
   * @param {chrome.tabs.Tab} [tab] 
   */
  async handleContextMenuAction(info, tab) {
    try {
      const { menuItemId, selectionText } = info;
      const text = selectionText || '';
      const tabId = tab?.id || 0;
      
      switch (menuItemId) {
        case 'genai-summarize-selection':
          await this.quickSummarizeText(text);
          break;
          
        case 'genai-explain-selection':
          await this.quickExplainConcept(text);
          break;
          
        case 'genai-translate-selection':
          await this.quickTranslateText(text);
          break;
          
        case 'genai-analyze-sentiment':
          await this.quickAnalyzeSentiment(text);
          break;
          
        case 'genai-summarize-page':
          await this.quickSummarizePage(tabId);
          break;
          
        case 'genai-extract-insights':
          await this.quickExtractInsights(tabId);
          break;
          
        case 'genai-generate-tags':
          await this.quickGenerateTags(tabId);
          break;
      }
    } catch (error) {
      /** @type {any} */
      const err = error;
      this.errorHandler.handleError(err, 'Context menu action failed');
      this.notificationManager.showError('Action failed. Please try again.');
    }
  }

  /** @param {string} text */
  async quickSummarizeText(text) {
    const summary = await this.processContentSummary({
      content: text,
      summaryType: 'key-points',
      targetLength: 'short'
    });
    
    // @ts-ignore
    this.notificationManager.showSuccess(
      'Text Summarized',
      summary.summary.substring(0, 100) + '...'
    );
  }

  async setupPeriodicTasks() {
    // Clean up old data every 24 hours
    chrome.alarms.create('cleanupOldData', { periodInMinutes: 1440 });
    
    // Update AI model availability every 6 hours
    chrome.alarms.create('updateAIStatus', { periodInMinutes: 360 });
    
    chrome.alarms.onAlarm.addListener(this.handlePeriodicTask.bind(this));
  }

  /** @param {chrome.alarms.Alarm} alarm */
  async handlePeriodicTask(alarm) {
    switch (alarm.name) {
      case 'cleanupOldData':
        await this.storageService.cleanupOldData();
        break;
        
      case 'updateAIStatus':
        await this.aiOrchestrator.refreshProviderAvailability();
        break;
    }
  }

  /** @param {string} targetLength */
  calculateMaxTokens(targetLength) {
    /** @type {Record<string, number>} */
    const lengthTokenMap = {
      'short': 150,
      'medium': 300,
      'long': 500,
      'detailed': 800
    };
    return lengthTokenMap[targetLength] || 300;
  }

  // Stubs for missing methods
  /** @param {any} details */
  async handleInstallation(details) {
    this.logger.info('Extension installed/updated', details);
    await this.createContextMenus();
  }

  /** @param {string} command */
  async handleKeyboardCommand(command) {
    this.logger.info('Keyboard command received', { command });
  }

  /**
   * @param {number} _tabId
   * @param {object} _changeInfo
   * @param {chrome.tabs.Tab} _tab
   */
  async handleTabUpdate(_tabId, _changeInfo, _tab) {}
  
  /** @param {object} _activeInfo */
  async handleTabActivation(_activeInfo) {}
  
  /**
   * @param {object} _changes
   * @param {string} _areaName
   */
  async handleStorageChange(_changes, _areaName) {}

  /** @param {any} _payload */
  async processContentTranslation(_payload) { return {}; }
  /** @param {any} _payload */
  async processSentimentAnalysis(_payload) { return {}; }
  /** @param {number} tabId @param {any} _payload */
  async extractPageContent(tabId, _payload) {
    if (!tabId) throw new Error('No active tab');
    try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'extractContent' });
        if (response && response.success) {
            return response.data;
        }
        throw new Error(response?.error || 'Extraction failed');
    } catch (error) {
        console.warn('Tab communication failed:', error);
        throw error;
    }
  }
  /** @param {any} _payload */
  async createIntelligentBookmark(_payload) { return {}; }
  /** @param {any} _payload */
  async exportUserData(_payload) { return {}; }
  /** @param {any} _payload */
  async importUserData(_payload) { return {}; }

  /** @param {string} _text */
  async quickExplainConcept(_text) {}
  /** @param {string} _text */
  async quickTranslateText(_text) {}
  /** @param {string} _text */
  async quickAnalyzeSentiment(_text) {}
  /** @param {number} _tabId */
  async quickSummarizePage(_tabId) {}
  /** @param {number} _tabId */
  async quickExtractInsights(_tabId) {}
  /** @param {number} _tabId */
  async quickGenerateTags(_tabId) {}
}

// Initialize the service
new BackgroundServiceOrchestrator();
