/**
 * @file utils/logger.js
 * @description Simple logging utility for debugging
 */

export class Logger {
  constructor(context = 'GenAI') {
    this.context = context;
    this.logLevel = 'info'; // debug, info, warn, error
  }

  debug(message, data = null) {
    if (this.shouldLog('debug')) {
      console.debug(`[${this.context}] ${message}`, data || '');
    }
  }

  info(message, data = null) {
    if (this.shouldLog('info')) {
      console.info(`[${this.context}] ${message}`, data || '');
    }
  }

  warn(message, data = null) {
    if (this.shouldLog('warn')) {
      console.warn(`[${this.context}] ${message}`, data || '');
    }
  }

  error(message, data = null) {
    if (this.shouldLog('error')) {
      console.error(`[${this.context}] ${message}`, data || '');
    }
  }

  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  setLogLevel(level) {
    this.logLevel = level;
  }
}