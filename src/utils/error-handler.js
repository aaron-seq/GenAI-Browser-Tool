/**
 * @fileoverview Advanced error handling utility for GenAI Browser Tool
 * @author Aaron Sequeira
 * @version 4.0.1
 */

/**
 * Enhanced error handler with logging, reporting, and recovery strategies
 */
export class ErrorHandler {
  constructor(contextName = 'Unknown') {
    this.contextName = contextName;
    this.errorCount = 0;
    this.errorHistory = [];
    this.maxHistorySize = 50;
    this.rateLimitMap = new Map();
    this.setupGlobalErrorHandling();
  }

  /**
   * Handle errors with context and recovery options
   * @param {Error} error - The error object
   * @param {string} operationName - Name of the failed operation
   * @param {Object} context - Additional context information
   * @param {Object} options - Error handling options
   */
  handleError(error, operationName = 'Unknown Operation', context = {}, options = {}) {
    try {
      const errorInfo = this.createErrorInfo(error, operationName, context);
      
      // Apply rate limiting to prevent spam
      if (this.isRateLimited(errorInfo.signature)) {
        return;
      }

      this.logError(errorInfo);
      this.updateErrorHistory(errorInfo);
      
      if (options.showToUser !== false) {
        this.displayUserFriendlyError(errorInfo);
      }

      if (options.reportError) {
        this.reportError(errorInfo);
      }

      // Attempt recovery if strategy provided
      if (options.recoveryStrategy) {
        this.attemptRecovery(options.recoveryStrategy, errorInfo);
      }

      this.errorCount++;
    } catch (handlerError) {
      console.error('Error handler failed:', handlerError);
    }
  }

  /**
   * Handle critical errors that may require immediate attention
   * @param {Error} error - The critical error
   * @param {string} operationName - Name of the failed operation
   * @param {Object} context - Additional context
   */
  handleCriticalError(error, operationName = 'Critical Operation', context = {}) {
    const errorInfo = this.createErrorInfo(error, operationName, {
      ...context,
      severity: 'critical',
      timestamp: Date.now()
    });

    console.error(`CRITICAL ERROR in ${this.contextName}:`, errorInfo);
    
    // Always show critical errors to user
    this.displayCriticalErrorMessage(errorInfo);
    
    // Report critical errors immediately
    this.reportError(errorInfo);

    // Store in persistent storage for debugging
    this.storeCriticalError(errorInfo);
  }

  /**
   * Create comprehensive error information object
   * @param {Error} error - The error object
   * @param {string} operationName - Operation name
   * @param {Object} context - Additional context
   * @returns {Object} Error information object
   */
  createErrorInfo(error, operationName, context) {
    const errorInfo = {
      message: error.message || 'Unknown error occurred',
      name: error.name || 'UnknownError',
      stack: error.stack,
      operationName,
      contextName: this.contextName,
      timestamp: Date.now(),
      errorId: this.generateErrorId(),
      signature: this.generateErrorSignature(error, operationName),
      severity: context.severity || 'error',
      userAgent: navigator.userAgent,
      url: window.location?.href || 'extension-popup',
      additionalContext: context
    };

    return errorInfo;
  }

  /**
   * Generate unique error ID for tracking
   * @returns {string} Unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate error signature for deduplication
   * @param {Error} error - The error object
   * @param {string} operationName - Operation name
   * @returns {string} Error signature
   */
  generateErrorSignature(error, operationName) {
    const message = error.message || '';
    const name = error.name || '';
    return `${this.contextName}:${operationName}:${name}:${message.slice(0, 100)}`;
  }

  /**
   * Check if error is rate limited
   * @param {string} signature - Error signature
   * @returns {boolean} True if rate limited
   */
  isRateLimited(signature) {
    const now = Date.now();
    const rateLimitWindow = 60000; // 1 minute
    const maxErrorsPerWindow = 5;

    if (!this.rateLimitMap.has(signature)) {
      this.rateLimitMap.set(signature, []);
    }

    const errorTimes = this.rateLimitMap.get(signature);
    
    // Remove old entries outside the window
    while (errorTimes.length > 0 && errorTimes[0] < now - rateLimitWindow) {
      errorTimes.shift();
    }

    if (errorTimes.length >= maxErrorsPerWindow) {
      return true;
    }

    errorTimes.push(now);
    return false;
  }

  /**
   * Log error to console with proper formatting
   * @param {Object} errorInfo - Error information object
   */
  logError(errorInfo) {
    const logLevel = errorInfo.severity === 'critical' ? 'error' : 'warn';
    
    console[logLevel](`[${this.contextName}] ${errorInfo.operationName} failed:`, {
      message: errorInfo.message,
      errorId: errorInfo.errorId,
      timestamp: new Date(errorInfo.timestamp).toISOString(),
      context: errorInfo.additionalContext
    });

    if (errorInfo.stack) {
      console.groupCollapsed('Stack trace');
      console.error(errorInfo.stack);
      console.groupEnd();
    }
  }

  /**
   * Update error history with size limit
   * @param {Object} errorInfo - Error information object
   */
  updateErrorHistory(errorInfo) {
    this.errorHistory.push(errorInfo);
    
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Display user-friendly error message
   * @param {Object} errorInfo - Error information object
   */
  displayUserFriendlyError(errorInfo) {
    const userMessage = this.createUserFriendlyMessage(errorInfo);
    this.showNotification(userMessage, 'error');
  }

  /**
   * Display critical error message to user
   * @param {Object} errorInfo - Error information object
   */
  displayCriticalErrorMessage(errorInfo) {
    const message = `A critical error occurred in ${errorInfo.operationName}. Please refresh the extension and try again.`;
    this.showNotification(message, 'critical');
  }

  /**
   * Create user-friendly error message
   * @param {Object} errorInfo - Error information object
   * @returns {string} User-friendly message
   */
  createUserFriendlyMessage(errorInfo) {
    const messageMap = {
      'NetworkError': 'Network connection issue. Please check your internet connection.',
      'TypeError': 'An unexpected error occurred. Please try again.',
      'SecurityError': 'Security restriction encountered. Please check permissions.',
      'QuotaExceededError': 'Storage limit exceeded. Please clear some data.',
      'TimeoutError': 'Operation timed out. Please try again.',
    };

    return messageMap[errorInfo.name] || 
           `An error occurred in ${errorInfo.operationName}. Please try again.`;
  }

  /**
   * Show notification to user
   * @param {string} message - Message to show
   * @param {string} type - Notification type
   */
  showNotification(message, type = 'error') {
    // Try to use the browser's notification system
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'GenAI Browser Tool',
        message: message
      });
    } else {
      // Fallback to console for testing environments
      console.warn(`Notification (${type}): ${message}`);
    }
  }

  /**
   * Report error to monitoring service (if configured)
   * @param {Object} errorInfo - Error information object
   */
  reportError(errorInfo) {
    try {
      // Store error for potential reporting
      const reportData = {
        errorId: errorInfo.errorId,
        message: errorInfo.message,
        context: errorInfo.contextName,
        operation: errorInfo.operationName,
        severity: errorInfo.severity,
        timestamp: errorInfo.timestamp,
        userAgent: errorInfo.userAgent.substring(0, 200), // Limit size
        url: errorInfo.url
      };

      // Store in local storage for potential batch reporting
      this.storeErrorReport(reportData);
    } catch (reportError) {
      console.error('Failed to report error:', reportError);
    }
  }

  /**
   * Store error report in local storage
   * @param {Object} reportData - Error report data
   */
  storeErrorReport(reportData) {
    try {
      const storageKey = 'genai_error_reports';
      const existingReports = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      existingReports.push(reportData);
      
      // Keep only last 20 reports
      if (existingReports.length > 20) {
        existingReports.splice(0, existingReports.length - 20);
      }

      localStorage.setItem(storageKey, JSON.stringify(existingReports));
    } catch (storageError) {
      console.error('Failed to store error report:', storageError);
    }
  }

  /**
   * Store critical error in persistent storage
   * @param {Object} errorInfo - Error information object
   */
  storeCriticalError(errorInfo) {
    try {
      const storageKey = 'genai_critical_errors';
      const criticalErrors = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      criticalErrors.push({
        errorId: errorInfo.errorId,
        message: errorInfo.message,
        context: errorInfo.contextName,
        operation: errorInfo.operationName,
        timestamp: errorInfo.timestamp
      });

      // Keep only last 5 critical errors
      if (criticalErrors.length > 5) {
        criticalErrors.shift();
      }

      localStorage.setItem(storageKey, JSON.stringify(criticalErrors));
    } catch (storageError) {
      console.error('Failed to store critical error:', storageError);
    }
  }

  /**
   * Attempt to recover from error using provided strategy
   * @param {Function} recoveryStrategy - Recovery function
   * @param {Object} errorInfo - Error information
   */
  async attemptRecovery(recoveryStrategy, errorInfo) {
    try {
      console.log(`Attempting recovery for ${errorInfo.operationName}...`);
      await recoveryStrategy(errorInfo);
      console.log('Recovery successful');
    } catch (recoveryError) {
      console.error('Recovery failed:', recoveryError);
    }
  }

  /**
   * Setup global error handling
   */
  setupGlobalErrorHandling() {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.handleError(
          new Error(event.message),
          'Global Error Handler',
          {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          }
        );
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.handleError(
          new Error(event.reason?.message || 'Unhandled Promise Rejection'),
          'Unhandled Promise',
          { reason: event.reason }
        );
      });
    }
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    return {
      totalErrors: this.errorCount,
      historySize: this.errorHistory.length,
      recentErrors: this.errorHistory.slice(-5),
      contextName: this.contextName
    };
  }

  /**
   * Clear error history
   */
  clearErrorHistory() {
    this.errorHistory = [];
    this.errorCount = 0;
    this.rateLimitMap.clear();
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.clearErrorHistory();
  }
}