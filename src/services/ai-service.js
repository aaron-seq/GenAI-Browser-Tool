/**
 * @fileoverview AI service with multi-provider support for GenAI Browser Tool
 * @author Aaron Sequeira
 * @version 4.0.1
 */

import { ErrorHandler } from '../utils/error-handler.js';
import { ValidationService } from '../utils/validation-service.js';

/**
 * Modern AI service with support for multiple providers and intelligent fallbacks
 */
export class AIService {
  constructor() {
    this.errorHandler = new ErrorHandler('AIService');
    this.validationService = new ValidationService();
    this.providers = new Map();
    this.currentProvider = null;
    this.requestCache = new Map();
    this.rateLimiter = new Map();
    
    this.initializeProviders();
  }

  /**
   * Initialize available AI providers
   */
  async initializeProviders() {
    try {
      // Initialize providers based on available APIs and keys
      await this.loadProviderConfigurations();
      this.currentProvider = await this.selectOptimalProvider();
    } catch (error) {
      this.errorHandler.handleError(error, 'Provider initialization failed');
    }
  }

  /**
   * Generate content summary with intelligent processing
   * @param {Object} summaryRequest - Summary request parameters
   * @returns {Promise<Object>} Summary response
   */
  async generateContentSummary(summaryRequest) {
    try {
      const validation = this.validationService.validateContentForSummarization(
        summaryRequest.content
      );

      if (!validation.isValid) {
        throw new Error(`Invalid content: ${validation.errors.join(', ')}`);
      }

      const cacheKey = this.generateCacheKey('summary', summaryRequest);
      const cachedResult = this.requestCache.get(cacheKey);
      
      if (cachedResult && !this.isCacheExpired(cachedResult.timestamp)) {
        return { success: true, data: cachedResult.data, fromCache: true };
      }

      if (await this.isRateLimited('summary')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      const summaryResponse = await this.executeWithRetry(
        () => this.callSummaryProvider(summaryRequest),
        3
      );

      // Cache successful results
      this.requestCache.set(cacheKey, {
        data: summaryResponse,
        timestamp: Date.now()
      });

      this.updateRateLimit('summary');

      return { success: true, data: summaryResponse };
    } catch (error) {
      this.errorHandler.handleError(error, 'Content summarization failed');
      return { 
        success: false, 
        error: error.message || 'Failed to generate summary'
      };
    }
  }

  /**
   * Answer contextual questions with conversation memory
   * @param {Object} questionRequest - Question request parameters
   * @returns {Promise<Object>} Answer response
   */
  async answerContextualQuestion(questionRequest) {
    try {
      if (!this.validationService.isValidQuestion(questionRequest.question)) {
        throw new Error('Invalid question format');
      }

      const cacheKey = this.generateCacheKey('question', questionRequest);
      const cachedResult = this.requestCache.get(cacheKey);
      
      if (cachedResult && !this.isCacheExpired(cachedResult.timestamp)) {
        return { success: true, data: cachedResult.data, fromCache: true };
      }

      if (await this.isRateLimited('question')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      const answerResponse = await this.executeWithRetry(
        () => this.callQuestionProvider(questionRequest),
        3
      );

      this.requestCache.set(cacheKey, {
        data: answerResponse,
        timestamp: Date.now()
      });

      this.updateRateLimit('question');

      return { success: true, data: answerResponse };
    } catch (error) {
      this.errorHandler.handleError(error, 'Question answering failed');
      return {
        success: false,
        error: error.message || 'Failed to answer question'
      };
    }
  }

  /**
   * Translate content with language detection
   * @param {Object} translationRequest - Translation request parameters
   * @returns {Promise<Object>} Translation response
   */
  async translateContent(translationRequest) {
    try {
      const { content, targetLanguage = 'en', preserveFormatting = true } = translationRequest;

      if (!content || content.trim().length === 0) {
        throw new Error('No content provided for translation');
      }

      if (await this.isRateLimited('translation')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      const translationResponse = await this.executeWithRetry(
        () => this.callTranslationProvider({
          content: content.trim(),
          targetLanguage,
          preserveFormatting
        }),
        2
      );

      this.updateRateLimit('translation');

      return { success: true, data: translationResponse };
    } catch (error) {
      this.errorHandler.handleError(error, 'Content translation failed');
      return {
        success: false,
        error: error.message || 'Failed to translate content'
      };
    }
  }

  /**
   * Call summary provider with current configuration
   * @param {Object} request - Summary request
   * @returns {Promise<Object>} Summary response
   */
  async callSummaryProvider(request) {
    if (!this.currentProvider) {
      throw new Error('No AI provider available');
    }

    const { content, summaryType = 'key-points', targetLength = 'medium' } = request;
    
    const prompt = this.buildSummaryPrompt(content, summaryType, targetLength);
    
    const response = await this.makeProviderRequest({
      prompt,
      maxTokens: this.getMaxTokensForLength(targetLength),
      temperature: 0.3
    });

    return {
      summary: response.text,
      summaryType,
      targetLength,
      provider: this.currentProvider.name,
      processingStats: {
        inputLength: content.length,
        outputLength: response.text.length,
        compressionRatio: (response.text.length / content.length).toFixed(2)
      }
    };
  }

  /**
   * Call question provider with context
   * @param {Object} request - Question request
   * @returns {Promise<Object>} Answer response
   */
  async callQuestionProvider(request) {
    const { question, pageContent, conversationHistory = [] } = request;
    
    const prompt = this.buildQuestionPrompt(question, pageContent, conversationHistory);
    
    const response = await this.makeProviderRequest({
      prompt,
      maxTokens: 500,
      temperature: 0.4
    });

    return {
      answer: response.text,
      confidence: response.confidence || 0.9,
      provider: this.currentProvider.name,
      hasContext: !!pageContent
    };
  }

  /**
   * Call translation provider
   * @param {Object} request - Translation request
   * @returns {Promise<Object>} Translation response
   */
  async callTranslationProvider(request) {
    const { content, targetLanguage, preserveFormatting } = request;
    
    const prompt = this.buildTranslationPrompt(content, targetLanguage, preserveFormatting);
    
    const response = await this.makeProviderRequest({
      prompt,
      maxTokens: Math.min(content.length * 2, 1000),
      temperature: 0.2
    });

    return {
      originalText: content,
      translatedText: response.text,
      sourceLanguage: 'auto-detected',
      targetLanguage,
      confidence: response.confidence || 0.8,
      provider: this.currentProvider.name
    };
  }

  /**
   * Make request to current AI provider
   * @param {Object} requestParams - Request parameters
   * @returns {Promise<Object>} Provider response
   */
  async makeProviderRequest(requestParams) {
    // This would interface with the actual AI provider APIs
    // For now, return a mock response
    return {
      text: 'This is a sample AI response that would come from the selected provider.',
      confidence: 0.9,
      tokensUsed: 150
    };
  }

  /**
   * Build summary prompt based on type and length
   * @param {string} content - Content to summarize
   * @param {string} type - Summary type
   * @param {string} length - Target length
   * @returns {string} Formatted prompt
   */
  buildSummaryPrompt(content, type, length) {
    const prompts = {
      'key-points': `Please provide a ${length} summary highlighting the key points from the following content:\n\n${content}\n\nKey points:`,
      'abstract': `Please create a ${length} abstract of the following content:\n\n${content}\n\nAbstract:`,
      'tldr': `Please provide a TL;DR (${length} version) of the following content:\n\n${content}\n\nTL;DR:`
    };

    return prompts[type] || prompts['key-points'];
  }

  /**
   * Build question prompt with context
   * @param {string} question - User question
   * @param {Object} pageContent - Page content for context
   * @param {Array} history - Conversation history
   * @returns {string} Formatted prompt
   */
  buildQuestionPrompt(question, pageContent, history) {
    let prompt = '';
    
    if (pageContent?.mainTextContent) {
      prompt += `Context from current page:\n${pageContent.mainTextContent.slice(0, 2000)}\n\n`;
    }
    
    if (history.length > 0) {
      prompt += 'Previous conversation:\n';
      history.slice(-3).forEach(item => {
        prompt += `Q: ${item.question}\nA: ${item.answer}\n\n`;
      });
    }
    
    prompt += `Question: ${question}\n\nAnswer:`;
    
    return prompt;
  }

  /**
   * Build translation prompt
   * @param {string} content - Content to translate
   * @param {string} targetLanguage - Target language
   * @param {boolean} preserveFormatting - Whether to preserve formatting
   * @returns {string} Formatted prompt
   */
  buildTranslationPrompt(content, targetLanguage, preserveFormatting) {
    const formatNote = preserveFormatting ? ' (preserve original formatting)' : '';
    return `Please translate the following text to ${targetLanguage}${formatNote}:\n\n${content}\n\nTranslation:`;
  }

  /**
   * Execute function with retry logic
   * @param {Function} fn - Function to execute
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<any>} Function result
   */
  async executeWithRetry(fn, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Load provider configurations from storage
   */
  async loadProviderConfigurations() {
    try {
      // This would load from chrome.storage or other configuration source
      const config = await this.getStoredConfiguration();
      
      // Initialize available providers based on configuration
      if (config.openaiKey) {
        this.providers.set('openai', {
          name: 'OpenAI',
          type: 'openai',
          apiKey: config.openaiKey,
          available: true
        });
      }
      
      if (config.anthropicKey) {
        this.providers.set('anthropic', {
          name: 'Claude',
          type: 'anthropic',
          apiKey: config.anthropicKey,
          available: true
        });
      }
    } catch (error) {
      console.warn('Failed to load provider configurations:', error);
    }
  }

  /**
   * Select optimal provider based on availability and performance
   * @returns {Object|null} Selected provider
   */
  async selectOptimalProvider() {
    const availableProviders = Array.from(this.providers.values())
      .filter(provider => provider.available);
    
    if (availableProviders.length === 0) {
      return null;
    }
    
    // For now, return the first available provider
    // In the future, this could include performance metrics
    return availableProviders[0];
  }

  /**
   * Generate cache key for request
   * @param {string} type - Request type
   * @param {Object} request - Request object
   * @returns {string} Cache key
   */
  generateCacheKey(type, request) {
    const keyData = {
      type,
      content: request.content?.slice(0, 100) || '',
      question: request.question || '',
      params: JSON.stringify({
        summaryType: request.summaryType,
        targetLength: request.targetLength,
        targetLanguage: request.targetLanguage
      })
    };
    
    return btoa(JSON.stringify(keyData)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
  }

  /**
   * Check if cache entry is expired
   * @param {number} timestamp - Cache timestamp
   * @returns {boolean} True if expired
   */
  isCacheExpired(timestamp) {
    const cacheLifetime = 10 * 60 * 1000; // 10 minutes
    return Date.now() - timestamp > cacheLifetime;
  }

  /**
   * Check if rate limited for operation type
   * @param {string} operationType - Type of operation
   * @returns {boolean} True if rate limited
   */
  async isRateLimited(operationType) {
    const limits = {
      summary: { requests: 10, window: 60000 }, // 10 per minute
      question: { requests: 20, window: 60000 }, // 20 per minute
      translation: { requests: 15, window: 60000 } // 15 per minute
    };
    
    const limit = limits[operationType];
    if (!limit) return false;
    
    const now = Date.now();
    const requests = this.rateLimiter.get(operationType) || [];
    
    // Remove expired entries
    const validRequests = requests.filter(time => now - time < limit.window);
    
    if (validRequests.length >= limit.requests) {
      return true;
    }
    
    return false;
  }

  /**
   * Update rate limit tracking
   * @param {string} operationType - Type of operation
   */
  updateRateLimit(operationType) {
    const now = Date.now();
    const requests = this.rateLimiter.get(operationType) || [];
    
    requests.push(now);
    this.rateLimiter.set(operationType, requests);
  }

  /**
   * Get stored configuration
   * @returns {Promise<Object>} Configuration object
   */
  async getStoredConfiguration() {
    // Mock configuration - would interface with chrome.storage
    return {
      openaiKey: '',
      anthropicKey: '',
      preferredProvider: 'openai'
    };
  }

  /**
   * Get max tokens for summary length
   * @param {string} length - Target length
   * @returns {number} Max tokens
   */
  getMaxTokensForLength(length) {
    const tokenLimits = {
      short: 150,
      medium: 300,
      long: 500,
      detailed: 800
    };
    
    return tokenLimits[length] || 300;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.requestCache.clear();
    this.rateLimiter.clear();
    this.providers.clear();
  }
}