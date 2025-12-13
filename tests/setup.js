/**
 * Test setup configuration for GenAI Browser Tool
 * Configures global test environment, mocks, and utilities
 */

import { vi, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Mock Chrome extension APIs
/** @type {any} */
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn()
    },
    onInstalled: {
      addListener: vi.fn()
    },
    sendMessage: vi.fn(),
    getURL: vi.fn((path) => `chrome-extension://mock-id/${path}`),
    id: 'mock-extension-id'
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined)
    },
    sync: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined)
    }
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({}),
    sendMessage: vi.fn(),
    onUpdated: {
      addListener: vi.fn()
    },
    onActivated: {
      addListener: vi.fn()
    }
  },
  contextMenus: {
    create: vi.fn(),
    removeAll: vi.fn().mockResolvedValue(undefined),
    onClicked: {
      addListener: vi.fn()
    }
  },
  commands: {
    onCommand: {
      addListener: vi.fn()
    }
  },
  notifications: {
    create: vi.fn(),
    clear: vi.fn()
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn()
    }
  },
  scripting: {
    executeScript: vi.fn().mockResolvedValue([{ result: {} }])
  }
};

// Setup global chrome API mock
global.chrome = mockChrome;

// Mock fetch for API calls
global.fetch = vi.fn();

// Setup DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = /** @type {any} */ (dom.window);
global.document = dom.window.document;
global.navigator = /** @type {any} */ (dom.window.navigator);
global.HTMLElement = dom.window.HTMLElement;

// Mock console methods in test environment
if (process.env['NODE_ENV'] === 'test') {
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

// Setup performance mock
/** @type {any} */
global.performance = {
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn()
};

// Cleanup function for tests
export const cleanup = () => {
  vi.clearAllMocks();
  // Reset chrome API mocks
  Object.values(mockChrome).forEach(api => {
    if (typeof api === 'object' && api !== null) {
      Object.values(api).forEach(method => {
        if (typeof method?.mockClear === 'function') {
          method.mockClear();
        }
      });
    }
  });
};

// Auto cleanup after each test
afterEach(() => {
  cleanup();
});