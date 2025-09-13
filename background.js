/**
 * @file background.js
 * @description Service worker for the GenAI Browser Tool, handling background tasks.
 */

import { StorageManager } from './services/storage.js';
import { AIProviderFactory } from './services/aiService.js';
import {
    generateId,
    estimateReadingTime,
    countWords,
    convertToCSV,
    convertToMarkdown
} from './utils/helpers.js';

class BackgroundService {
    constructor() {
        this.storageManager = new StorageManager();
        this.aiProviderFactory = new AIProviderFactory();
        this.initialize();
    }

    async initialize() {
        console.log('GenAI Service Worker: Initializing...');
        this.registerEventListeners();
        await this.setupContextMenus();
        await this.onStartup();
    }

    registerEventListeners() {
        chrome.runtime.onInstalled.addListener(details => this.handleInstallation(details));
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleRuntimeMessage(message, sender, sendResponse);
            return true; // Indicates an async response.
        });
        chrome.contextMenus.onClicked.addListener((info, tab) => this.handleContextMenuClick(info, tab));
        chrome.commands.onCommand.addListener(command => this.handleCommand(command));
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
                this.handleTabUpdate(tabId, tab);
            }
        });
    }

    async setupContextMenus() {
        await chrome.contextMenus.removeAll();
        const contexts = ["selection", "page"];
        const menus = [{
            id: 'summarize-selection',
            title: 'Summarize selected text',
            contexts: ['selection']
        }, {
            id: 'translate-selection',
            title: 'Translate selected text',
            contexts: ['selection']
        }, {
            id: 'analyze-sentiment-selection',
            title: 'Analyze sentiment',
            contexts: ['selection']
        }, {
            id: 'explain-selection',
            title: 'Explain this',
            contexts: ['selection']
        }, {
            type: 'separator',
            id: 'separator-1',
            contexts: ['page']
        }, {
            id: 'summarize-page',
            title: 'Summarize entire page',
            contexts: ['page']
        }, {
            id: 'extract-insights-page',
            title: 'Extract key insights',
            contexts: ['page']
        }, ];
        menus.forEach(menu => chrome.contextMenus.create(menu));
        console.log('GenAI Service Worker: Context menus created.');
    }

    async onStartup() {
        const settings = await this.storageManager.getSettings();
        if (!settings.initialized) {
            await this.storageManager.initializeDefaults();
        }
    }

    async handleInstallation(details) {
        if (details.reason === 'install') {
            await this.storageManager.initializeDefaults();
            chrome.tabs.create({
                url: chrome.runtime.getURL('options.html?welcome=true')
            });
            this.showNotification('Welcome to GenAI Browser Tool!', 'Click to configure your AI settings.');
        } else if (details.reason === 'update') {
            console.log(`Updated from ${details.previousVersion} to ${chrome.runtime.getManifest().version}`);
            // Future migration logic can go here.
        }
    }

    async handleRuntimeMessage(message, sender, sendResponse) {
        const {
            action,
            data
        } = message;
        try {
            let responseData;
            switch (action) {
                case 'summarize':
                    responseData = await this.getSummarization(data);
                    break;
                case 'ask-question':
                    responseData = await this.getQuestionAnswer(data);
                    break;
                case 'translate':
                    responseData = await this.getTranslation(data);
                    break;
                case 'analyze-sentiment':
                    responseData = await this.getSentimentAnalysis(data);
                    break;
                case 'extract-content':
                    responseData = await this.getPageContent(sender.tab.id);
                    break;
                case 'save-bookmark':
                    responseData = await this.createSmartBookmark(data);
                    break;
                case 'get-settings':
                    responseData = await this.storageManager.getSettings();
                    break;
                case 'update-settings':
                    await this.storageManager.updateSettings(data);
                    responseData = {
                        status: 'success'
                    };
                    break;
                case 'export-data':
                    responseData = await this.getExportData(data);
                    break;
                default:
                    throw new Error(`Unknown action: ${action}`);
            }
            sendResponse({
                success: true,
                data: responseData
            });
        } catch (error) {
            console.error(`Error handling action "${action}":`, error);
            sendResponse({
                success: false,
                error: error.message
            });
        }
    }

    async handleContextMenuClick(info, tab) {
        try {
            const {
                menuItemId,
                selectionText
            } = info;
            switch (menuItemId) {
                case 'summarize-selection':
                    if (selectionText) {
                        const summary = await this.getSummarization({
                            text: selectionText,
                            type: 'key-points',
                            length: 'short'
                        });
                        this.showNotification('Text Summarized', `${summary.substring(0, 100)}...`);
                    }
                    break;
                case 'translate-selection':
                    if (selectionText) {
                        const translation = await this.getTranslation({
                            text: selectionText,
                            targetLanguage: 'en'
                        });
                        this.showNotification('Text Translated', `${translation.substring(0, 100)}...`);
                    }
                    break;
                case 'analyze-sentiment-selection':
                    if (selectionText) {
                        const sentiment = await this.getSentimentAnalysis({
                            text: selectionText
                        });
                        this.showNotification('Sentiment Analysis', `${sentiment.label} (${sentiment.confidence.toFixed(2)}%)`);
                    }
                    break;
                case 'summarize-page':
                    const content = await this.getPageContent(tab.id);
                    const pageSummary = await this.getSummarization({
                        text: content.text,
                        type: 'tldr',
                        length: 'medium'
                    });
                    this.showNotification('Page Summarized', `${pageSummary.substring(0, 100)}...`);
                    break;
            }
        } catch (error) {
            console.error('Error handling context menu click:', error);
            this.showNotification('Error', 'Failed to process your request.');
        }
    }

    async handleCommand(command) {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });
        if (!tab) return;

        try {
            switch (command) {
                case 'summarize_page':
                    const content = await this.getPageContent(tab.id);
                    const summary = await this.getSummarization({
                        text: content.text,
                        type: 'tldr',
                        length: 'medium'
                    });
                    this.showNotification('Page Summary', `${summary.substring(0, 100)}...`);
                    break;
                case 'toggle_popup':
                    chrome.action.openPopup();
                    break;
            }
        } catch (error) {
            console.error(`Error handling command "${command}":`, error);
        }
    }

    async handleTabUpdate(tabId, tab) {
        const settings = await this.storageManager.getSettings();
        if (settings.autoAnalysis) {
            // Debounce analysis to avoid running on every minor update.
            setTimeout(async () => {
                const content = await this.getPageContent(tabId);
                await this.storageManager.savePageAnalysis(tab.url, {
                    title: tab.title,
                    readingTime: estimateReadingTime(content.text),
                    wordCount: countWords(content.text),
                    analyzedAt: Date.now(),
                });
            }, 2000);
        }
    }

    async getAIProvider() {
        const settings = await this.storageManager.getSettings();
        return this.aiProviderFactory.create(settings.preferredProvider, {
            apiKey: settings.apiKeys[settings.preferredProvider],
            model: settings.preferredModel,
        });
    }


    async getSummarization(data) {
        const provider = await this.getAIProvider();
        return provider.summarize(data.text, data);
    }

    async getQuestionAnswer(data) {
        const provider = await this.getAIProvider();
        return provider.askQuestion(data.question, data);
    }

    async getTranslation(data) {
        const provider = await this.getAIProvider();
        return provider.translate(data.text, data);
    }

    async getSentimentAnalysis(data) {
        const provider = await this.getAIProvider();
        return provider.analyzeSentiment(data.text, data);
    }

    async getPageContent(tabId) {
        const results = await chrome.scripting.executeScript({
            target: {
                tabId
            },
            files: ['content.js'],
        });
        if (chrome.runtime.lastError) {
            throw new Error(chrome.runtime.lastError.message);
        }
        // Assuming content.js returns the extracted content.
        const [result] = await chrome.tabs.sendMessage(tabId, {
            action: 'extractContent'
        });
        return result.data;
    }

    async createSmartBookmark(data) {
        const {
            url,
            title,
            content,
            tags = [],
            analysis
        } = data;
        const bookmark = {
            id: generateId(),
            url,
            title,
            summary: content.substring(0, 500),
            tags,
            analysis,
            createdAt: Date.now(),
            readingTime: estimateReadingTime(content),
            wordCount: countWords(content),
        };
        await this.storageManager.saveBookmark(bookmark);
        return bookmark;
    }

    async getExportData(options) {
        const {
            format,
            include
        } = options;
        let data = {};
        if (include.bookmarks) data.bookmarks = await this.storageManager.getAllBookmarks();
        if (include.history) data.analysisHistory = await this.storageManager.getAnalysisHistory();
        if (include.settings) {
            const settings = await this.storageManager.getSettings();
            delete settings.apiKeys; // Sanitize sensitive data.
            data.settings = settings;
        }

        switch (format) {
            case 'json':
                return JSON.stringify(data, null, 2);
            case 'csv':
                return convertToCSV(data);
            case 'markdown':
                return convertToMarkdown(data);
            default:
                return data;
        }
    }

    showNotification(title, message) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title,
            message,
        });
    }
}

new BackgroundService();
