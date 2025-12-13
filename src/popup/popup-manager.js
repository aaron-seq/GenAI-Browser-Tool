/**
 * @fileoverview Main popup manager for GenAI Browser Tool extension
 * @author Aaron Sequeira
 * @version 4.0.1
 */

import { EventManager } from '../utils/event-manager.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { UIRenderer } from '../ui/ui-renderer.js';
import { ContentExtractor } from '../services/content-extractor.js';
import { AIService } from '../services/ai-service.js';
import { StorageManager } from '../services/storage-manager.js';
import { ValidationService } from '../utils/validation-service.js';

/**
 * Manages the popup interface and user interactions
 * Provides a clean, performant interface for AI-powered browser features
 */
export class PopupManager {
  constructor() {
    this.eventManager = new EventManager();
    this.errorHandler = new ErrorHandler('PopupManager');
    this.uiRenderer = new UIRenderer();
    this.contentExtractor = new ContentExtractor();
    this.aiService = new AIService();
    this.storageManager = new StorageManager();
    this.validationService = new ValidationService();
    
    this.currentPageContent = null;
    this.isInitialized = false;
    this.conversationHistory = [];
    this.activeOperations = new Set();
    
    this.initializePopup();
  }

  /**
   * Initialize the popup with error handling and graceful degradation
   */
  async initializePopup() {
    try {
      this.showLoadingState('Initializing GenAI Assistant...');
      
      await this.setupEventListeners();
      await this.loadUserPreferences();
      await this.extractCurrentPageContent();
      await this.restoreSessionState();
      
      this.isInitialized = true;
      this.hideLoadingState();
      this.showSuccessMessage('Ready to assist!');
    } catch (error) {
      this.errorHandler.handleError(error, 'Failed to initialize popup');
      this.showErrorState('Failed to initialize. Please refresh and try again.');
    }
  }

  /**
   * Set up all event listeners with proper error boundaries
   */
  async setupEventListeners() {
    const eventBindings = [
      { selector: '#summarize-page-button', event: 'click', handler: this.handlePageSummarization },
      { selector: '#ask-question-button', event: 'click', handler: this.handleQuestionSubmission },
      { selector: '#translate-content-button', event: 'click', handler: this.handleContentTranslation },
      { selector: '#analyze-sentiment-button', event: 'click', handler: this.handleSentimentAnalysis },
      { selector: '#export-results-button', event: 'click', handler: this.handleResultsExport },
      { selector: '#question-input', event: 'keypress', handler: this.handleQuestionInputKeypress },
      { selector: '.tab-navigation-button', event: 'click', handler: this.handleTabSwitch },
      { selector: '.settings-toggle', event: 'click', handler: this.handleSettingsToggle }
    ];

    eventBindings.forEach(({ selector, event, handler }) => {
      this.eventManager.addEventListenerSafely(
        selector,
        event,
        handler.bind(this),
        { passive: false, once: false }
      );
    });
  }

  /**
   * Extract content from the current page with fallback handling
   */
  async extractCurrentPageContent() {
    try {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!this.validationService.isValidWebPage(activeTab)) {
        this.showWarningMessage('Cannot access this page type');
        return;
      }

      const contentResponse = await chrome.tabs.sendMessage(activeTab.id, {
        actionType: 'EXTRACT_PAGE_CONTENT',
        requestId: this.generateRequestId(),
        options: {
          includeMetadata: true,
          includeImages: false,
          maxContentLength: 50000
        }
      });

      if (contentResponse?.success) {
        this.currentPageContent = contentResponse.data;
        this.updatePageInfoDisplay(activeTab, this.currentPageContent);
      } else {
        throw new Error(contentResponse?.error || 'Content extraction failed');
      }
    } catch (error) {
      this.errorHandler.handleError(error, 'Page content extraction failed');
      this.showWarningMessage('Limited functionality - could not access page content');
    }
  }

  /**
   * Handle page summarization with multiple summary types
   */
  async handlePageSummarization(_event) {
    const operationId = 'page-summarization';
    
    if (this.activeOperations.has(operationId)) {
      this.showWarningMessage('Summarization already in progress');
      return;
    }

    try {
      this.activeOperations.add(operationId);
      this.showLoadingState('Generating intelligent summary...');

      if (!this.currentPageContent?.mainTextContent) {
        throw new Error('No content available to summarize');
      }

      const summaryOptions = this.getSummaryOptions();
      const summaryResponse = await this.aiService.generateContentSummary({
        content: this.currentPageContent.mainTextContent,
        title: this.currentPageContent.pageTitle,
        url: this.currentPageContent.pageUrl,
        ...summaryOptions
      });

      if (summaryResponse.success) {
        this.displaySummaryResults(summaryResponse.data);
        await this.storageManager.saveSummaryToHistory(summaryResponse.data);
      } else {
        throw new Error(summaryResponse.error || 'Summarization failed');
      }
    } catch (error) {
      this.errorHandler.handleError(error, 'Page summarization failed');
      this.showErrorMessage('Failed to generate summary. Please try again.');
    } finally {
      this.activeOperations.delete(operationId);
      this.hideLoadingState();
    }
  }

  /**
   * Handle question submission with conversation context
   */
  async handleQuestionSubmission(_event) {
    const questionInput = document.getElementById('question-input');
    const userQuestion = questionInput.value.trim();

    if (!this.validationService.isValidQuestion(userQuestion)) {
      this.showWarningMessage('Please enter a valid question');
      return;
    }

    const operationId = 'question-answering';
    
    try {
      this.activeOperations.add(operationId);
      questionInput.value = '';
      this.addConversationMessage('user', userQuestion);
      this.showTypingIndicator();

      const questionResponse = await this.aiService.answerContextualQuestion({
        question: userQuestion,
        pageContent: this.currentPageContent,
        conversationHistory: this.conversationHistory,
        includeSourceReferences: true
      });

      if (questionResponse.success) {
        this.addConversationMessage('assistant', questionResponse.data.answer);
        this.conversationHistory.push({
          question: userQuestion,
          answer: questionResponse.data.answer,
          timestamp: Date.now()
        });
      } else {
        throw new Error(questionResponse.error || 'Failed to get answer');
      }
    } catch (error) {
      this.errorHandler.handleError(error, 'Question answering failed');
      this.addConversationMessage('assistant', 'I apologize, but I encountered an error while processing your question. Please try again.');
    } finally {
      this.activeOperations.delete(operationId);
      this.hideTypingIndicator();
    }
  }

  /**
   * Handle keyboard shortcuts for question input
   */
  handleQuestionInputKeypress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.handleQuestionSubmission(event);
    }
  }

  /**
   * Handle content translation with language detection
   */
  async handleContentTranslation(_event) {
    const operationId = 'content-translation';
    
    try {
      this.activeOperations.add(operationId);
      this.showLoadingState('Translating content...');

      const selectedText = await this.getSelectedText();
      const contentToTranslate = selectedText || this.currentPageContent?.mainTextContent;

      if (!contentToTranslate) {
        throw new Error('No content selected for translation');
      }

      const translationOptions = this.getTranslationOptions();
      const translationResponse = await this.aiService.translateContent({
        content: contentToTranslate,
        ...translationOptions
      });

      if (translationResponse.success) {
        this.displayTranslationResults(translationResponse.data);
      } else {
        throw new Error(translationResponse.error || 'Translation failed');
      }
    } catch (error) {
      this.errorHandler.handleError(error, 'Content translation failed');
      this.showErrorMessage('Translation failed. Please try again.');
    } finally {
      this.activeOperations.delete(operationId);
      this.hideLoadingState();
    }
  }

  /**
   * Get summary options from UI controls
   */
  getSummaryOptions() {
    const summaryTypeElement = document.getElementById('summary-type-select');
    const summaryLengthElement = document.querySelector('input[name="summary-length"]:checked');
    
    return {
      summaryType: summaryTypeElement?.value || 'key-points',
      targetLength: summaryLengthElement?.value || 'medium',
      includeKeyInsights: true,
      includeSentiment: false
    };
  }

  /**
   * Get translation options from UI controls
   */
  getTranslationOptions() {
    const targetLanguageElement = document.getElementById('target-language-select');
    const preserveFormattingElement = document.getElementById('preserve-formatting-checkbox');
    
    return {
      targetLanguage: targetLanguageElement?.value || 'auto-detect',
      preserveFormatting: preserveFormattingElement?.checked || true,
      includeOriginal: true
    };
  }

  /**
   * Display summary results in the UI
   */
  displaySummaryResults(summaryData) {
    const summaryContainer = document.getElementById('summary-results-container');
    
    summaryContainer.innerHTML = this.uiRenderer.renderSummaryCard({
      summary: summaryData.summary,
      keyPoints: summaryData.keyPoints,
      processingStats: summaryData.processingStats,
      provider: summaryData.provider
    });

    this.animateElementAppearance(summaryContainer);
  }

  /**
   * Add a message to the conversation display
   */
  addConversationMessage(role, content) {
    const conversationContainer = document.getElementById('conversation-container');
    const messageElement = this.uiRenderer.createConversationMessage(role, content);
    
    conversationContainer.appendChild(messageElement);
    this.scrollToBottom(conversationContainer);
    this.animateElementAppearance(messageElement);
  }

  /**
   * Show loading state with custom message
   */
  showLoadingState(message = 'Processing...') {
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    
    loadingText.textContent = message;
    loadingOverlay.classList.add('active');
  }

  /**
   * Hide loading state
   */
  hideLoadingState() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.classList.remove('active');
  }

  /**
   * Show success message to user
   */
  showSuccessMessage(message) {
    this.showStatusMessage(message, 'success');
  }

  /**
   * Show warning message to user
   */
  showWarningMessage(message) {
    this.showStatusMessage(message, 'warning');
  }

  /**
   * Show error message to user
   */
  showErrorMessage(message) {
    this.showStatusMessage(message, 'error');
  }

  /**
   * Show status message with type
   */
  showStatusMessage(message, type = 'info') {
    const statusContainer = document.getElementById('status-container');
    const statusMessage = this.uiRenderer.createStatusMessage(message, type);
    
    statusContainer.appendChild(statusMessage);
    
    setTimeout(() => {
      statusMessage.classList.add('fade-out');
      setTimeout(() => statusMessage.remove(), 300);
    }, 3000);
  }

  /**
   * Generate unique request ID for tracking
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Animate element appearance
   */
  animateElementAppearance(element) {
    element.style.opacity = '0';
    element.style.transform = 'translateY(10px)';
    
    requestAnimationFrame(() => {
      element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    });
  }

  /**
   * Scroll element to bottom smoothly
   */
  scrollToBottom(element) {
    element.scrollTo({
      top: element.scrollHeight,
      behavior: 'smooth'
    });
  }

  /**
   * Load user preferences from storage
   */
  async loadUserPreferences() {
    try {
      const preferences = await this.storageManager.getUserPreferences();
      this.applyUserPreferences(preferences);
    } catch (error) {
      this.errorHandler.handleError(error, 'Failed to load user preferences');
    }
  }

  /**
   * Apply user preferences to the UI
   */
  applyUserPreferences(preferences) {
    if (preferences.theme) {
      document.body.setAttribute('data-theme', preferences.theme);
    }
    
    if (preferences.language) {
      document.documentElement.setAttribute('lang', preferences.language);
    }
  }

  /**
   * Cleanup resources when popup closes
   */
  cleanup() {
    this.eventManager.removeAllListeners();
    this.activeOperations.clear();
  }
}

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PopupManager());
} else {
  new PopupManager();
}