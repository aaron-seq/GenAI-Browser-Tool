/**
 * @fileoverview Event management utility for GenAI Browser Tool
 * @author Aaron Sequeira
 * @version 4.0.1
 */

/**
 * Manages event listeners with automatic cleanup and error handling
 * Provides a centralized way to handle DOM events safely
 */
export class EventManager {
  constructor() {
    this.activeListeners = new Map();
    this.listenerIdCounter = 0;
  }

  /**
   * Add event listener with error boundary and cleanup tracking
   * @param {string} selector - CSS selector or element
   * @param {string} eventType - Event type (click, change, etc.)
   * @param {Function} handler - Event handler function
   * @param {Object} options - Event listener options
   * @returns {string} Listener ID for removal
   */
  addEventListenerSafely(selector, eventType, handler, options = {}) {
    try {
      const element = typeof selector === 'string' 
        ? document.querySelector(selector)
        : selector;

      if (!element) {
        console.warn(`Element not found for selector: ${selector}`);
        return null;
      }

      const listenerId = `listener_${++this.listenerIdCounter}`;
      const safeHandler = this.createSafeHandler(handler, selector, eventType);

      element.addEventListener(eventType, safeHandler, options);

      this.activeListeners.set(listenerId, {
        element,
        eventType,
        handler: safeHandler,
        originalHandler: handler,
        selector,
        options
      });

      return listenerId;
    } catch (error) {
      console.error(`Failed to add event listener for ${selector}:${eventType}`, error);
      return null;
    }
  }

  /**
   * Remove specific event listener by ID
   * @param {string} listenerId - ID returned by addEventListenerSafely
   */
  removeEventListener(listenerId) {
    const listenerInfo = this.activeListeners.get(listenerId);
    
    if (listenerInfo) {
      try {
        listenerInfo.element.removeEventListener(
          listenerInfo.eventType,
          listenerInfo.handler,
          listenerInfo.options
        );
        this.activeListeners.delete(listenerId);
      } catch (error) {
        console.error(`Failed to remove event listener ${listenerId}`, error);
      }
    }
  }

  /**
   * Remove all event listeners managed by this instance
   */
  removeAllListeners() {
    for (const [listenerId] of this.activeListeners) {
      this.removeEventListener(listenerId);
    }
  }

  /**
   * Create a safe event handler with error boundary
   * @param {Function} handler - Original handler function
   * @param {string} selector - Element selector for debugging
   * @param {string} eventType - Event type for debugging
   * @returns {Function} Safe handler function
   */
  createSafeHandler(handler, selector, eventType) {
    return function safeEventHandler(event) {
      try {
        return handler.call(this, event);
      } catch (error) {
        console.error(`Event handler error for ${selector}:${eventType}`, error);
        
        // Prevent event from bubbling if handler fails
        if (event && typeof event.stopPropagation === 'function') {
          event.stopPropagation();
        }
      }
    };
  }

  /**
   * Add delegated event listener for dynamic content
   * @param {string} parentSelector - Parent element selector
   * @param {string} childSelector - Child element selector to match
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   */
  addDelegatedListener(parentSelector, childSelector, eventType, handler) {
    const delegatedHandler = (event) => {
      if (event.target.matches(childSelector)) {
        handler.call(event.target, event);
      }
    };

    return this.addEventListenerSafely(parentSelector, eventType, delegatedHandler);
  }

  /**
   * Add one-time event listener that removes itself after execution
   * @param {string} selector - CSS selector or element
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   */
  addOneTimeListener(selector, eventType, handler) {
    const oneTimeHandler = (event) => {
      handler.call(this, event);
      this.removeEventListener(listenerId);
    };

    const listenerId = this.addEventListenerSafely(
      selector, 
      eventType, 
      oneTimeHandler,
      { once: true }
    );

    return listenerId;
  }

  /**
   * Add throttled event listener to limit execution frequency
   * @param {string} selector - CSS selector or element
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   * @param {number} throttleMs - Throttle delay in milliseconds
   */
  addThrottledListener(selector, eventType, handler, throttleMs = 100) {
    let lastExecutionTime = 0;
    let timeoutId = null;

    const throttledHandler = (event) => {
      const now = Date.now();
      const timeSinceLastExecution = now - lastExecutionTime;

      if (timeSinceLastExecution >= throttleMs) {
        lastExecutionTime = now;
        handler.call(this, event);
      } else {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          lastExecutionTime = Date.now();
          handler.call(this, event);
        }, throttleMs - timeSinceLastExecution);
      }
    };

    return this.addEventListenerSafely(selector, eventType, throttledHandler);
  }

  /**
   * Add debounced event listener to delay execution until activity stops
   * @param {string} selector - CSS selector or element
   * @param {string} eventType - Event type
   * @param {Function} handler - Event handler
   * @param {number} debounceMs - Debounce delay in milliseconds
   */
  addDebouncedListener(selector, eventType, handler, debounceMs = 300) {
    let timeoutId = null;

    const debouncedHandler = (event) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handler.call(this, event);
      }, debounceMs);
    };

    return this.addEventListenerSafely(selector, eventType, debouncedHandler);
  }

  /**
   * Get information about active listeners (for debugging)
   * @returns {Object} Summary of active listeners
   */
  getListenerSummary() {
    const summary = {
      totalListeners: this.activeListeners.size,
      listenersByType: new Map(),
      listenersBySelector: new Map()
    };

    for (const [, info] of this.activeListeners) {
      // Count by event type
      const typeCount = summary.listenersByType.get(info.eventType) || 0;
      summary.listenersByType.set(info.eventType, typeCount + 1);

      // Count by selector
      const selectorCount = summary.listenersBySelector.get(info.selector) || 0;
      summary.listenersBySelector.set(info.selector, selectorCount + 1);
    }

    return summary;
  }

  /**
   * Clean up all resources
   */
  destroy() {
    this.removeAllListeners();
    this.activeListeners.clear();
    this.listenerIdCounter = 0;
  }
}