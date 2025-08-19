// GenAI Browser Tool - Service Worker (Background Script)
// Advanced AI-powered browser extension service worker

import { StorageManager } from './storage.js';
import { AIProviders } from './ai-providers.js';
import { Utils } from './utils.js';

class ServiceWorker {
  constructor() {
    this.offscreenDocumentPath = 'offscreen.html';
    this.isOffscreenDocumentOpen = false;
    this.storageManager = new StorageManager();
    this.aiProviders = new AIProviders();
    this.utils = new Utils();
    
    this.initializeServiceWorker();
  }

  async initializeServiceWorker() {
    console.log('GenAI Service Worker initialized');
    
    // Register event listeners
    this.registerEventListeners();
    
    // Initialize context menus
    await this.createContextMenus();
    
    // Initialize AI capabilities
    await this.initializeAI();
  }

  registerEventListeners() {
    // Runtime message handling
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });

    // Context menu click handler
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      this.handleContextMenuClick(info, tab);
    });

    // Keyboard commands
    chrome.commands.onCommand.addListener((command) => {
      this.handleCommand(command);
    });

    // Tab updates for content analysis
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdate(tabId, tab);
      }
    });

    // Installation and update handling
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });
  }

  async createContextMenus() {
    try {
      await chrome.contextMenus.removeAll();
      
      chrome.contextMenus.create({
        id: 'summarize-selection',
        title: 'Summarize selected text',
        contexts: ['selection']
      });

      chrome.contextMenus.create({
        id: 'translate-selection',
        title: 'Translate selected text',
        contexts: ['selection']
      });

      chrome.contextMenus.create({
        id: 'analyze-sentiment',
        title: 'Analyze sentiment',
        contexts: ['selection']
      });

      chrome.contextMenus.create({
        id: 'explain-selection',
        title: 'Explain this',
        contexts: ['selection']
      });

      chrome.contextMenus.create({
        type: 'separator',
        id: 'separator-1',
        contexts: ['page']
      });

      chrome.contextMenus.create({
        id: 'summarize-page',
        title: 'Summarize entire page',
        contexts: ['page']
      });

      chrome.contextMenus.create({
        id: 'extract-insights',
        title: 'Extract key insights',
        contexts: ['page']
      });

      console.log('Context menus created successfully');
    } catch (error) {
      console.error('Error creating context menus:', error);
    }
  }

  async initializeAI() {
    try {
      // Check for Chrome built-in AI APIs
      if ('ai' in chrome && 'summarizer' in chrome.ai) {
        console.log('Chrome built-in Summarizer API available');
      }
      
      if ('ai' in chrome && 'languageModel' in chrome.ai) {
        console.log('Chrome built-in Language Model API available');
      }

      // Initialize settings if not present
      const settings = await this.storageManager.getSettings();
      if (!settings.initialized) {
        await this.storageManager.initializeDefaults();
      }

    } catch (error) {
      console.error('Error initializing AI capabilities:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      const { action, data } = message;

      switch (action) {
        case 'summarize':
          const summary = await this.handleSummarization(data);
          sendResponse({ success: true, data: summary });
          break;

        case 'ask-question':
          const answer = await this.handleQuestion(data);
          sendResponse({ success: true, data: answer });
          break;

        case 'translate':
          const translation = await this.handleTranslation(data);
          sendResponse({ success: true, data: translation });
          break;

        case 'analyze-sentiment':
          const sentiment = await this.handleSentimentAnalysis(data);
          sendResponse({ success: true, data: sentiment });
          break;

        case 'extract-content':
          const content = await this.extractPageContent(sender.tab.id);
          sendResponse({ success: true, data: content });
          break;

        case 'save-bookmark':
          const bookmark = await this.saveSmartBookmark(data);
          sendResponse({ success: true, data: bookmark });
          break;

        case 'get-settings':
          const settings = await this.storageManager.getSettings();
          sendResponse({ success: true, data: settings });
          break;

        case 'update-settings':
          await this.storageManager.updateSettings(data);
          sendResponse({ success: true });
          break;

        case 'export-data':
          const exportData = await this.exportData(data);
          sendResponse({ success: true, data: exportData });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleContextMenuClick(info, tab) {
    try {
      switch (info.menuItemId) {
        case 'summarize-selection':
          if (info.selectionText) {
            const summary = await this.handleSummarization({
              text: info.selectionText,
              type: 'key-points',
              length: 'short'
            });
            this.showNotification('Text Summarized', summary.substring(0, 100) + '...');
          }
          break;

        case 'translate-selection':
          if (info.selectionText) {
            const translation = await this.handleTranslation({
              text: info.selectionText,
              targetLanguage: 'auto-detect'
            });
            this.showNotification('Text Translated', translation.substring(0, 100) + '...');
          }
          break;

        case 'analyze-sentiment':
          if (info.selectionText) {
            const sentiment = await this.handleSentimentAnalysis({
              text: info.selectionText
            });
            this.showNotification('Sentiment Analysis', `${sentiment.label} (${sentiment.confidence}%)`);
          }
          break;

        case 'summarize-page':
          const content = await this.extractPageContent(tab.id);
          const pageSummary = await this.handleSummarization({
            text: content.text,
            type: 'tldr',
            length: 'medium'
          });
          this.showNotification('Page Summarized', pageSummary.substring(0, 100) + '...');
          break;
      }
    } catch (error) {
      console.error('Error handling context menu click:', error);
      this.showNotification('Error', 'Failed to process request');
    }
  }

  async handleCommand(command) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      switch (command) {
        case 'summarize_page':
          const content = await this.extractPageContent(tab.id);
          const summary = await this.handleSummarization({
            text: content.text,
            type: 'tldr',
            length: 'medium'
          });
          this.showNotification('Page Summary', summary.substring(0, 100) + '...');
          break;

        case 'toggle_popup':
          chrome.action.openPopup();
          break;
      }
    } catch (error) {
      console.error('Error handling command:', error);
    }
  }

  async handleTabUpdate(tabId, tab) {
    try {
      // Auto-analysis feature (if enabled in settings)
      const settings = await this.storageManager.getSettings();
      
      if (settings.autoAnalysis && this.utils.isValidUrl(tab.url)) {
        // Perform background analysis
        setTimeout(async () => {
          const content = await this.extractPageContent(tabId);
          await this.storageManager.savePageAnalysis(tab.url, {
            title: tab.title,
            readingTime: this.utils.estimateReadingTime(content.text),
            wordCount: this.utils.countWords(content.text),
            timestamp: Date.now()
          });
        }, 2000); // Delay to let page fully load
      }
    } catch (error) {
      console.error('Error handling tab update:', error);
    }
  }

  async handleInstallation(details) {
    try {
      if (details.reason === 'install') {
        // First installation
        await this.storageManager.initializeDefaults();
        
        // Open welcome page
        chrome.tabs.create({
          url: chrome.runtime.getURL('options.html') + '?welcome=true'
        });
        
        this.showNotification(
          'Welcome to GenAI Browser Tool!',
          'Click to configure your AI settings and get started.'
        );
      } else if (details.reason === 'update') {
        // Update existing installation
        const previousVersion = details.previousVersion;
        console.log(`Updated from version ${previousVersion} to ${chrome.runtime.getManifest().version}`);
        
        // Perform any necessary migration
        await this.migrateData(previousVersion);
      }
    } catch (error) {
      console.error('Error handling installation:', error);
    }
  }

  async handleSummarization(data) {
    const { text, type = 'key-points', length = 'medium', format = 'markdown' } = data;
    
    try {
      // Try Chrome built-in Summarizer API first
      if ('ai' in chrome && 'summarizer' in chrome.ai) {
        try {
          const summarizer = await chrome.ai.summarizer.create({
            type,
            format,
            length
          });
          
          const summary = await summarizer.summarize(text);
          summarizer.destroy();
          
          return summary;
        } catch (chromeAIError) {
          console.log('Chrome AI API failed, falling back to external providers:', chromeAIError);
        }
      }

      // Fallback to external AI providers
      const settings = await this.storageManager.getSettings();
      return await this.aiProviders.summarize(text, {
        type,
        length,
        format,
        provider: settings.preferredProvider,
        apiKey: settings.apiKeys[settings.preferredProvider]
      });

    } catch (error) {
      console.error('Error in summarization:', error);
      throw new Error('Failed to generate summary');
    }
  }

  async handleQuestion(data) {
    const { question, context, conversationHistory = [] } = data;
    
    try {
      const settings = await this.storageManager.getSettings();
      
      return await this.aiProviders.askQuestion(question, {
        context,
        conversationHistory,
        provider: settings.preferredProvider,
        apiKey: settings.apiKeys[settings.preferredProvider],
        model: settings.preferredModel
      });

    } catch (error) {
      console.error('Error answering question:', error);
      throw new Error('Failed to generate answer');
    }
  }

  async handleTranslation(data) {
    const { text, targetLanguage, sourceLanguage = 'auto' } = data;
    
    try {
      // Try Chrome built-in Translation API first (if available)
      if ('ai' in chrome && 'translator' in chrome.ai) {
        try {
          const translator = await chrome.ai.translator.create({
            sourceLanguage,
            targetLanguage
          });
          
          const translation = await translator.translate(text);
          translator.destroy();
          
          return translation;
        } catch (chromeAIError) {
          console.log('Chrome Translation API failed, falling back to external providers:', chromeAIError);
        }
      }

      // Fallback to external providers
      const settings = await this.storageManager.getSettings();
      return await this.aiProviders.translate(text, {
        targetLanguage,
        sourceLanguage,
        provider: settings.preferredProvider,
        apiKey: settings.apiKeys[settings.preferredProvider]
      });

    } catch (error) {
      console.error('Error in translation:', error);
      throw new Error('Failed to translate text');
    }
  }

  async handleSentimentAnalysis(data) {
    const { text } = data;
    
    try {
      const settings = await this.storageManager.getSettings();
      
      return await this.aiProviders.analyzeSentiment(text, {
        provider: settings.preferredProvider,
        apiKey: settings.apiKeys[settings.preferredProvider]
      });

    } catch (error) {
      console.error('Error in sentiment analysis:', error);
      throw new Error('Failed to analyze sentiment');
    }
  }

  async extractPageContent(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Extract meaningful content from the page
          const content = {
            title: document.title,
            url: window.location.href,
            text: '',
            headings: [],
            links: [],
            images: [],
            metadata: {}
          };

          // Get main text content, prioritizing article content
          const article = document.querySelector('article') || 
                         document.querySelector('[role="main"]') ||
                         document.querySelector('main') ||
                         document.body;
          
          content.text = article.innerText || '';

          // Extract headings
          const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
          content.headings = Array.from(headings).map(h => ({
            level: parseInt(h.tagName[1]),
            text: h.textContent.trim()
          }));

          // Extract metadata
          const metaTags = document.querySelectorAll('meta');
          metaTags.forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            const content_attr = meta.getAttribute('content');
            if (name && content_attr) {
              content.metadata[name] = content_attr;
            }
          });

          return content;
        }
      });

      return results[0].result;
    } catch (error) {
      console.error('Error extracting page content:', error);
      throw new Error('Failed to extract page content');
    }
  }

  async saveSmartBookmark(data) {
    try {
      const { url, title, content, tags = [], analysis } = data;
      
      const bookmark = {
        id: this.utils.generateId(),
        url,
        title,
        content: content.substring(0, 500), // Truncate for storage
        tags,
        analysis,
        timestamp: Date.now(),
        readingTime: this.utils.estimateReadingTime(content),
        wordCount: this.utils.countWords(content)
      };

      await this.storageManager.saveBookmark(bookmark);
      return bookmark;
    } catch (error) {
      console.error('Error saving bookmark:', error);
      throw new Error('Failed to save bookmark');
    }
  }

  async exportData(options) {
    try {
      const { format, include } = options;
      
      let data = {};
      
      if (include.bookmarks) {
        data.bookmarks = await this.storageManager.getAllBookmarks();
      }
      
      if (include.history) {
        data.analysisHistory = await this.storageManager.getAnalysisHistory();
      }
      
      if (include.settings) {
        const settings = await this.storageManager.getSettings();
        // Remove sensitive data
        delete settings.apiKeys;
        data.settings = settings;
      }

      // Format data according to requested format
      switch (format) {
        case 'json':
          return JSON.stringify(data, null, 2);
        case 'csv':
          return this.utils.convertToCSV(data);
        case 'markdown':
          return this.utils.convertToMarkdown(data);
        default:
          return data;
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      throw new Error('Failed to export data');
    }
  }

  async migrateData(previousVersion) {
    try {
      // Implement data migration logic for version updates
      console.log(`Migrating data from version ${previousVersion}`);
      
      // Add migration logic here as needed
      
    } catch (error) {
      console.error('Error migrating data:', error);
    }
  }

  showNotification(title, message) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title,
      message
    });
  }

  // Keep service worker alive during long operations
  async keepAlive(promise) {
    const keepAliveInterval = setInterval(() => {
      chrome.runtime.getPlatformInfo();
    }, 25000);

    try {
      return await promise;
    } finally {
      clearInterval(keepAliveInterval);
    }
  }
}

// Initialize the service worker
new ServiceWorker();