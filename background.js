/**
 * @file background.js
 * @description Service worker: routes UI requests to the configured AI provider.
 * @version 5.0.0
 */

import { ConfigurationManager } from './core/configuration-manager.js';
import { buildPrompt, parseSentiment, parseTags, wasTruncated } from './core/tasks.js';
import { AIError } from './providers/ai-client.js';
import { StorageService } from './services/storage-service.js';
import { NotificationManager } from './services/notification-manager.js';
import { ValidationService } from './src/utils/validation-service.js';
import { Logger } from './utils/logger.js';

/**
 * Context menu id -> the task it runs and where its input comes from.
 * @type {Record<string, { task: string, source: 'selection' | 'page', title: string }>}
 */
const CONTEXT_MENU_TASKS = {
  'genai-summarize-selection': { task: 'summary', source: 'selection', title: 'Summary' },
  'genai-explain-selection': { task: 'insights', source: 'selection', title: 'Key points' },
  'genai-translate-selection': { task: 'translation', source: 'selection', title: 'Translation' },
  'genai-analyze-sentiment': { task: 'sentiment', source: 'selection', title: 'Sentiment' },
  'genai-summarize-page': { task: 'summary', source: 'page', title: 'Page summary' },
  'genai-extract-insights': { task: 'insights', source: 'page', title: 'Key insights' },
  'genai-generate-tags': { task: 'tags', source: 'page', title: 'Smart tags' }
};

class BackgroundService {
  constructor() {
    this.logger = new Logger('BackgroundService');
    this.configManager = new ConfigurationManager();
    this.storageService = new StorageService();
    this.notificationManager = new NotificationManager();
    this.validator = new ValidationService();

    this.registerListeners();
    this.initialize();
  }

  async initialize() {
    try {
      await this.configManager.initialize();
      await this.createContextMenus();
      this.logger.info('Service initialized');
    } catch (error) {
      /** @type {any} */
      const err = error;
      this.logger.error('Service initialization failed', err.message);
    }
  }

  /**
   * Listeners are registered synchronously at worker start. Registering them
   * inside an async initializer loses events fired while the worker is waking.
   */
  registerListeners() {
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // async sendResponse
    });
    chrome.contextMenus.onClicked.addListener(this.handleContextMenu.bind(this));
    chrome.commands.onCommand.addListener(this.handleCommand.bind(this));
    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
    chrome.alarms.create('cleanupOldData', { periodInMinutes: 1440 });
  }

  // ---------------------------------------------------------------- messaging

  /**
   * @param {any} message
   * @param {chrome.runtime.MessageSender} sender
   * @param {(response: any) => void} sendResponse
   */
  async handleMessage(message, sender, sendResponse) {
    const startTime = Date.now();
    const requestId = message?.requestId;

    try {
      if (!this.validator.validateMessage(message, sender)) {
        throw new AIError('INVALID_MESSAGE', 'Malformed message or unknown sender');
      }

      const data = await this.route(message.actionType, message.payload || {}, sender);
      sendResponse({ success: true, data, requestId, processingTime: Date.now() - startTime });
    } catch (error) {
      /** @type {any} */
      const err = error;
      this.logger.error(`Action ${message?.actionType} failed`, err.message);
      sendResponse({
        success: false,
        error: err.message,
        errorCode: err.code || 'UNKNOWN_ERROR',
        requestId,
        processingTime: Date.now() - startTime
      });
    }
  }

  /**
   * @param {string} actionType
   * @param {any} payload
   * @param {chrome.runtime.MessageSender} sender
   * @returns {Promise<any>}
   */
  async route(actionType, payload, sender) {
    switch (actionType) {
      case 'GENERATE_CONTENT_SUMMARY':
        return this.summarize(payload);

      case 'ANSWER_CONTEXTUAL_QUESTION':
        return this.answerQuestion(payload);

      case 'TRANSLATE_CONTENT':
        return this.runTask('translation', { ...payload, content: payload.text });

      case 'ANALYZE_SENTIMENT': {
        const result = await this.runTask('sentiment', { ...payload, content: payload.text });
        return { ...result, ...parseSentiment(result.text) };
      }

      case 'EXTRACT_KEY_INSIGHTS':
        return this.runTask('insights', { ...payload, content: payload.text });

      case 'GENERATE_SMART_TAGS': {
        const result = await this.runTask('tags', { ...payload, content: payload.text });
        return { ...result, tags: parseTags(result.text) };
      }

      case 'EXTRACT_ENTITIES':
        return this.runTask('entities', { ...payload, content: payload.text });

      case 'EXTRACT_PAGE_CONTENT':
        // The popup has no `sender.tab`, so it passes the id it queried itself.
        // Reading only `sender.tab.id` made every popup-initiated extraction fail.
        return this.extractPageContent(payload.tabId ?? sender.tab?.id);

      case 'GET_USER_PREFERENCES':
        return this.configManager.getUserPreferences();

      case 'UPDATE_USER_PREFERENCES':
        return this.configManager.updateUserPreferences(payload);

      case 'GET_PROVIDER_STATUS':
        return this.configManager.getProviderStatus();

      case 'GET_HISTORY':
        return this.storageService.getAnalysisHistory();

      case 'EXPORT_USER_DATA':
        return this.storageService.exportUserData(payload);

      default:
        throw new AIError('UNSUPPORTED_ACTION', `Unsupported action type: ${actionType}`);
    }
  }

  // ------------------------------------------------------------------- tasks

  /**
   * Run one AI task end to end.
   *
   * @param {string} task
   * @param {any} payload  Must carry `content` — the text to analyse.
   * @returns {Promise<{ text: string, provider: string, model: string, truncated: boolean }>}
   */
  async runTask(task, payload) {
    const content = (payload.content || '').trim();
    if (!content) {
      throw new AIError('NO_CONTENT', 'No page content available for this action');
    }

    const client = await this.configManager.createAIClient();
    const prompt = buildPrompt(task, { ...payload, content, text: content, context: content });
    const text = await client.complete(prompt.system, prompt.user, prompt.maxTokens);

    return {
      text,
      provider: client.provider,
      model: client.model,
      truncated: wasTruncated(content)
    };
  }

  /** @param {any} payload */
  async summarize(payload) {
    const result = await this.runTask('summary', payload);

    await this.storageService.saveSummaryHistory({
      originalContent: payload.content.slice(0, 500),
      summary: result.text,
      options: { type: payload.summaryType, length: payload.targetLength },
      provider: result.provider,
      timestamp: Date.now()
    });

    return {
      ...result,
      summary: result.text,
      stats: {
        inputLength: payload.content.length,
        outputLength: result.text.length
      }
    };
  }

  /** @param {any} payload */
  async answerQuestion(payload) {
    if (!this.validator.isValidQuestion(payload.question)) {
      throw new AIError('INVALID_QUESTION', 'Question is empty or too long');
    }

    const result = await this.runTask('question', { ...payload, content: payload.context });

    await this.storageService.updateConversationHistory({
      question: payload.question,
      answer: result.text,
      context: (payload.context || '').slice(0, 200),
      timestamp: Date.now()
    });

    return { ...result, answer: result.text };
  }

  /**
   * Ask the content script for the page text.
   *
   * @param {number | undefined} tabId
   * @returns {Promise<any>}
   */
  async extractPageContent(tabId) {
    if (!tabId) {
      throw new AIError('NO_TAB', 'No active tab to read content from');
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tabId, { action: 'extractContent' });
    } catch (error) {
      /** @type {any} */
      const err = error;
      // Content scripts do not run on chrome:// pages, the Web Store, or PDFs.
      throw new AIError(
        'CONTENT_SCRIPT_UNAVAILABLE',
        `Cannot read this page (${err.message}). Extensions cannot access browser pages or the Chrome Web Store.`
      );
    }

    if (!response?.success) {
      throw new AIError('EXTRACTION_FAILED', response?.error || 'Content extraction failed');
    }
    return response.data;
  }

  // ------------------------------------------------------------ context menus

  async createContextMenus() {
    await chrome.contextMenus.removeAll();

    /** @type {chrome.contextMenus.CreateProperties[]} */
    const items = [
      { id: 'genai-summarize-selection', title: 'Summarize selected text', contexts: ['selection'] },
      { id: 'genai-explain-selection', title: 'Explain this selection', contexts: ['selection'] },
      { id: 'genai-translate-selection', title: 'Translate selection', contexts: ['selection'] },
      { id: 'genai-analyze-sentiment', title: 'Analyze sentiment', contexts: ['selection'] },
      { id: 'genai-summarize-page', title: 'Summarize entire page', contexts: ['page'] },
      { id: 'genai-extract-insights', title: 'Extract key insights', contexts: ['page'] },
      { id: 'genai-generate-tags', title: 'Generate smart tags', contexts: ['page'] }
    ];
    items.forEach(item => chrome.contextMenus.create(item));
  }

  /**
   * @param {chrome.contextMenus.OnClickData} info
   * @param {chrome.tabs.Tab} [tab]
   */
  async handleContextMenu(info, tab) {
    const entry = CONTEXT_MENU_TASKS[String(info.menuItemId)];
    if (!entry) return;

    try {
      const content = entry.source === 'selection'
        ? info.selectionText || ''
        : (await this.extractPageContent(tab?.id)).mainText;

      const settings = await this.configManager.getUserPreferences();
      const result = await this.runTask(entry.task, {
        content,
        summaryType: settings.summaryType,
        targetLength: 'short',
        targetLanguage: settings.targetLanguage
      });

      this.notificationManager.showSuccess(entry.title, truncateForNotification(result.text));
    } catch (error) {
      /** @type {any} */
      const err = error;
      this.logger.error('Context menu action failed', err.message);
      this.notificationManager.showError(err.message);
    }
  }

  /** @param {string} command */
  async handleCommand(command) {
    if (command === 'quick-summarize') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await this.handleContextMenu(
        /** @type {any} */ ({ menuItemId: 'genai-summarize-page' }),
        tab
      );
    }
  }

  // ----------------------------------------------------------------- lifecycle

  /** @param {chrome.runtime.InstalledDetails} details */
  async handleInstalled(details) {
    await this.createContextMenus();
    if (details.reason === 'install') {
      chrome.runtime.openOptionsPage();
    }
  }

  /** @param {chrome.alarms.Alarm} alarm */
  async handleAlarm(alarm) {
    if (alarm.name === 'cleanupOldData') {
      await this.storageService.cleanupOldData();
    }
  }
}

/**
 * Chrome notifications silently drop bodies over ~250 characters.
 *
 * @param {string} text
 * @returns {string}
 */
function truncateForNotification(text) {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

new BackgroundService();
