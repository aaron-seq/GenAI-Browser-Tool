/**
 * @fileoverview Validation service for GenAI Browser Tool
 * @author Aaron Sequeira
 * @version 4.0.1
 */

/**
 * Comprehensive validation service for user inputs and system data
 * Provides security-focused validation with sanitization capabilities
 */
export class ValidationService {
  constructor() {
    this.urlPatterns = {
      http: /^https?:\/\//i,
      web: /^https?:\/\/[^\s/$.?#].[^\s]*$/i,
      extension: /^(chrome-extension|moz-extension):\/\//i
    };

    this.securityPatterns = {
      script: /<script[^>]*>.*?<\/script>/gi,
      html: /<[^>]*>/g,
      javascript: /javascript:/gi,
      dataUrl: /^data:/i
    };

    this.maxLengths = {
      question: 1000,
      summary: 10000,
      title: 200,
      description: 500
    };
  }

  /**
   * Validate if a tab is accessible for content extraction
   * @param {any} tab - Chrome tab object
   * @returns {boolean} True if tab is valid and accessible
   */
  isValidWebPage(tab) {
    if (!tab || !tab.url) {
      return false;
    }

    // Check for valid HTTP/HTTPS URLs
    if (!this.urlPatterns.web.test(tab.url)) {
      return false;
    }

    // Exclude restricted pages
    const restrictedDomains = [
      'chrome://',
      'chrome-extension://',
      'moz-extension://',
      'edge://',
      'about:',
      'file://'
    ];

    return !restrictedDomains.some(domain => tab.url.startsWith(domain));
  }

  /**
   * Validate user question input
   * @param {string} question - User question
   * @returns {boolean} True if question is valid
   */
  isValidQuestion(question) {
    if (!question || typeof question !== 'string') {
      return false;
    }

    const trimmedQuestion = question.trim();
    
    // Check length constraints
    if (trimmedQuestion.length === 0 || trimmedQuestion.length > this.maxLengths.question) {
      return false;
    }

    // Check for potential security issues
    if (this.containsMaliciousContent(trimmedQuestion)) {
      return false;
    }

    return true;
  }

  /**
   * Validate content for summarization
   * @param {string} content - Content to validate
   * @returns {Object} Validation result with details
   */
  validateContentForSummarization(content) {
    const result = {
      isValid: false,
      sanitizedContent: '',
      /** @type {string[]} */
      warnings: [],
      /** @type {string[]} */
      errors: []
    };

    if (!content || typeof content !== 'string') {
      result.errors.push('Content must be a non-empty string');
      return result;
    }

    const trimmedContent = content.trim();
    
    if (trimmedContent.length === 0) {
      result.errors.push('Content cannot be empty');
      return result;
    }

    if (trimmedContent.length > this.maxLengths.summary) {
      result.warnings.push(`Content is long (${trimmedContent.length} chars). Processing may be slower.`);
    }

    // Sanitize content
    result.sanitizedContent = this.sanitizeContent(trimmedContent);
    
    if (result.sanitizedContent.length < trimmedContent.length * 0.5) {
      result.warnings.push('Significant content was removed during sanitization');
    }

    result.isValid = result.sanitizedContent.length > 0;
    return result;
  }

  /**
   * Validate API key format and basic security
   * @param {string} apiKey - API key to validate
   * @param {string} provider - AI provider name
   * @returns {Object} Validation result
   */
  validateApiKey(apiKey, provider = 'unknown') {
    const result = {
      isValid: false,
      /** @type {string[]} */
      errors: [],
      /** @type {string[]} */
      warnings: []
    };

    if (!apiKey || typeof apiKey !== 'string') {
      result.errors.push('API key must be a non-empty string');
      return result;
    }

    const trimmedKey = apiKey.trim();
    
    if (trimmedKey.length < 10) {
      result.errors.push('API key appears to be too short');
      return result;
    }

    // Provider-specific validation
    const providerPatterns = {
      openai: /^sk-[a-zA-Z0-9]{48,}$/,
      anthropic: /^sk-ant-[a-zA-Z0-9\-_]{40,}$/,
      google: /^[a-zA-Z0-9\-_]{20,}$/
    };

    // @ts-ignore - Type 'string' cannot be used to index type '{ openai: RegExp; anthropic: RegExp; google: RegExp; }'.
    const pattern = providerPatterns[provider.toLowerCase()];
    if (pattern && !pattern.test(trimmedKey)) {
      result.warnings.push(`API key format doesn't match expected pattern for ${provider}`);
    }

    // Security checks
    if (this.containsMaliciousContent(trimmedKey)) {
      result.errors.push('API key contains suspicious characters');
      return result;
    }

    result.isValid = true;
    return result;
  }

  /**
   * Validate URL for safety and accessibility
   * @param {string} url - URL to validate
   * @returns {Object} Validation result
   */
  validateUrl(url) {
    const result = {
      isValid: false,
      sanitizedUrl: '',
      protocol: '',
      domain: '',
      /** @type {string[]} */
      errors: []
    };

    if (!url || typeof url !== 'string') {
      result.errors.push('URL must be a non-empty string');
      return result;
    }

    const trimmedUrl = url.trim();
    
    try {
      const urlObj = new URL(trimmedUrl);
      
      result.protocol = urlObj.protocol;
      result.domain = urlObj.hostname;
      result.sanitizedUrl = urlObj.toString();

      // Check for allowed protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        result.errors.push('Only HTTP and HTTPS URLs are allowed');
        return result;
      }

      // Check for suspicious domains or IPs
      if (this.isSuspiciousDomain(urlObj.hostname)) {
        result.errors.push('Suspicious or blocked domain detected');
        return result;
      }

      result.isValid = true;
    } catch (error) {
      result.errors.push('Invalid URL format');
    }

    return result;
  }

  /**
   * Validate file upload (if applicable)
   * @param {File} file - File object to validate
   * @returns {Object} Validation result
   */
  validateFileUpload(file) {
    const result = {
      isValid: false,
      /** @type {string[]} */
      errors: [],
      /** @type {string[]} */
      warnings: []
    };

    if (!file) {
      result.errors.push('No file provided');
      return result;
    }

    const allowedTypes = ['text/plain', 'text/html', 'text/markdown', 'application/json'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.type)) {
      result.errors.push(`File type '${file.type}' is not allowed`);
      return result;
    }

    if (file.size > maxSize) {
      result.errors.push('File size exceeds 5MB limit');
      return result;
    }

    if (file.size === 0) {
      result.errors.push('File appears to be empty');
      return result;
    }

    result.isValid = true;
    return result;
  }

  /**
   * Sanitize content by removing potentially harmful elements
   * @param {string} content - Content to sanitize
   * @returns {string} Sanitized content
   */
  sanitizeContent(content) {
    if (typeof content !== 'string') {
      return '';
    }

    let sanitized = content;

    // Remove script tags and content
    sanitized = sanitized.replace(this.securityPatterns.script, '');

    // Remove other HTML tags but keep content
    sanitized = sanitized.replace(this.securityPatterns.html, '');

    // Remove javascript: URLs
    sanitized = sanitized.replace(this.securityPatterns.javascript, '');

    // Decode HTML entities
    sanitized = this.decodeHtmlEntities(sanitized);

    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ').trim();

    return sanitized;
  }

  /**
   * Check if content contains malicious patterns
   * @param {string} content - Content to check
   * @returns {boolean} True if malicious content detected
   */
  containsMaliciousContent(content) {
    if (typeof content !== 'string') {
      return false;
    }

    const maliciousPatterns = [
      this.securityPatterns.script,
      this.securityPatterns.javascript,
      /eval\s*\(/gi,
      /document\.write/gi,
      /innerHTML\s*=/gi,
      /on\w+\s*=/gi, // Event handlers like onclick, onload
      /<iframe/gi,
      /<object/gi,
      /<embed/gi
    ];

    return maliciousPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Check if domain is suspicious or blocked
   * @param {string} hostname - Domain hostname
   * @returns {boolean} True if suspicious
   */
  isSuspiciousDomain(hostname) {
    if (!hostname) {
      return true;
    }

    // Check for localhost and private IPs
    const privatePatterns = [
      /^localhost$/i,
      /^127\.\d+\.\d+\.\d+$/,
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/
    ];

    // Allow localhost in development
    if (hostname === 'localhost' && this.isDevelopmentMode()) {
      return false;
    }

    return privatePatterns.some(pattern => pattern.test(hostname));
  }

  /**
   * Decode HTML entities in text
   * @param {string} text - Text with HTML entities
   * @returns {string} Decoded text
   */
  decodeHtmlEntities(text) {
    const entityMap = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&#x60;': '`',
      '&#x3D;': '='
    };

    return text.replace(/&[#\w]+;/g, (entity) => {
      // @ts-ignore - Type 'string' cannot be used to index type
      return entityMap[entity] || entity;
    });
  }

  /**
   * Check if running in development mode
   * @returns {boolean} True if in development
   */
  isDevelopmentMode() {
    // @ts-ignore - Global defined by build tool
    return typeof __DEV__ !== 'undefined' && __DEV__ === true; // eslint-disable-line no-undef
  }

  /**
   * Validate configuration object
   * @param {any} config - Configuration to validate
   * @param {any} schema - Expected schema
   * @returns {Object} Validation result
   */
  validateConfiguration(config, schema) {
    const result = {
      isValid: false,
      /** @type {string[]} */
      errors: [],
      /** @type {string[]} */
      warnings: []
    };

    if (!config || typeof config !== 'object') {
      result.errors.push('Configuration must be an object');
      return result;
    }

    if (!schema || typeof schema !== 'object') {
      result.errors.push('Schema must be provided');
      return result;
    }

    // Check required fields
    for (const [key, requirements] of Object.entries(schema)) {
      if (requirements.required && !(key in config)) {
        result.errors.push(`Required field '${key}' is missing`);
        continue;
      }

      if (key in config) {
        const value = config[key];
        
        // Type checking
        if (requirements.type && typeof value !== requirements.type) {
          result.errors.push(`Field '${key}' must be of type ${requirements.type}`);
        }

        // Range checking for numbers
        if (requirements.type === 'number' && typeof value === 'number') {
          if (requirements.min !== undefined && value < requirements.min) {
            result.errors.push(`Field '${key}' must be at least ${requirements.min}`);
          }
          if (requirements.max !== undefined && value > requirements.max) {
            result.errors.push(`Field '${key}' must be at most ${requirements.max}`);
          }
        }

        // Length checking for strings
        if (requirements.type === 'string' && typeof value === 'string') {
          if (requirements.minLength && value.length < requirements.minLength) {
            result.errors.push(`Field '${key}' must be at least ${requirements.minLength} characters`);
          }
          if (requirements.maxLength && value.length > requirements.maxLength) {
            result.errors.push(`Field '${key}' must be at most ${requirements.maxLength} characters`);
          }
        }
      }
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate extension message structure and sender
   * @param {any} message - The message object
   * @param {any} sender - The message sender
   * @returns {boolean} True if message is valid
   */
  validateMessage(message, sender) {
    if (!message || typeof message !== 'object') {
      return false;
    }

    if (!message.actionType || typeof message.actionType !== 'string') {
      return false;
    }

    // Basic sender validation
    if (!sender) {
      return false;
    }

    return true;
  }

  /**
   * Clean up resources
   */
  destroy() {
    // No cleanup needed for this service
  }
}