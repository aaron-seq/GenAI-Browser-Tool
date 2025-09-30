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
import { SecurityValidator } from './utils/security-validator.js';
import { ErrorHandler } from './utils/error-handler.js';
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
    this.securityValidator = new SecurityValidator();
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
      this.errorHandler.handleCriticalError(error, 'Service initialization failed');
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

  async handleIncomingMessage(message, sender, sendResponse) {
    const startTime = performance.now();
    
    try {
      // Security validation
      if (!this.securityValidator.validateMessage(message, sender)) {
        throw new Error('Invalid message or sender');
      }

      const { actionType, requestId, payload } = message;
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
          responseData = await this.extractPageContent(sender.tab?.id, payload);
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
      this.analyticsTracker.trackActionPerformance(actionType, processingTime);

      sendResponse({
        success: true,
        data: responseData,
        requestId,
        processingTime: Math.round(processingTime)
      });

    } catch (error) {
      const processingTime = performance.now() - startTime;
      this.errorHandler.handleError(error, 'Message processing failed', {
        action: message.actionType,
        requestId: message.requestId,
        processingTime
      });

      sendResponse({
        success: false,
        error: error.message,
        errorCode: error.code || 'UNKNOWN_ERROR',
        requestId: message.requestId,
        processingTime: Math.round(processingTime)
      });
    }
  }

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
      summary,
      options: summaryOptions,
      provider: aiProvider.name,
      timestamp: Date.now()
    });

    return {
      summary,
      provider: aiProvider.name,
      confidence: summary.confidence || 0.95,
      processingStats: {
        inputLength: content.length,
        outputLength: summary.length,
        compressionRatio: (summary.length / content.length).toFixed(2)
      }
    };
  }

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

  async handleContextMenuAction(info, tab) {
    try {
      const { menuItemId, selectionText } = info;
      
      switch (menuItemId) {
        case 'genai-summarize-selection':
          await this.quickSummarizeText(selectionText);
          break;
          
        case 'genai-explain-selection':
          await this.quickExplainConcept(selectionText);
          break;
          
        case 'genai-translate-selection':
          await this.quickTranslateText(selectionText);
          break;
          
        case 'genai-analyze-sentiment':
          await this.quickAnalyzeSentiment(selectionText);
          break;
          
        case 'genai-summarize-page':
          await this.quickSummarizePage(tab.id);
          break;
          
        case 'genai-extract-insights':
          await this.quickExtractInsights(tab.id);
          break;
          
        case 'genai-generate-tags':
          await this.quickGenerateTags(tab.id);
          break;
      }
    } catch (error) {
      this.errorHandler.handleError(error, 'Context menu action failed');
      this.notificationManager.showError('Action failed. Please try again.');
    }
  }

  async quickSummarizeText(text) {
    const summary = await this.processContentSummary({
      content: text,
      summaryType: 'key-points',
      targetLength: 'short'
    });
    
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

  calculateMaxTokens(targetLength) {
    const lengthTokenMap = {
      'short': 150,
      'medium': 300,
      'long': 500,
      'detailed': 800
    };
    return lengthTokenMap[targetLength] || 300;
  }
}

// Initialize the service
new BackgroundServiceOrchestrator();
