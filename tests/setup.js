/**
 * Global test setup: the `chrome.*` surface the extension talks to, and a fetch
 * stub so no test can reach a real provider.
 *
 * The DOM comes from Vitest's `environment: 'jsdom'`. This file used to build a
 * *second* JSDOM and assign it over `global.window` / `global.document`, which
 * left the environment split: `document` came from the manual instance while
 * `Event`, `HTMLElement`, and `confirm` still came from Vitest's. Stubbing
 * `window.confirm` then had no effect on the bare `confirm()` a page actually
 * calls, and a listener attached to one `document` never saw the other's events.
 */

import { vi, afterEach } from 'vitest';

/** @type {any} */
const mockChrome = {
  runtime: {
    onMessage: { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    getURL: vi.fn(path => `chrome-extension://mock-extension-id/${path}`),
    openOptionsPage: vi.fn(),
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
    onUpdated: { addListener: vi.fn() },
    onActivated: { addListener: vi.fn() }
  },
  contextMenus: {
    create: vi.fn(),
    removeAll: vi.fn().mockResolvedValue(undefined),
    onClicked: { addListener: vi.fn() }
  },
  commands: { onCommand: { addListener: vi.fn() } },
  notifications: { create: vi.fn(), clear: vi.fn() },
  alarms: { create: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn() } },
  scripting: { executeScript: vi.fn().mockResolvedValue([{ result: {} }]) }
};

globalThis.chrome = mockChrome;
globalThis.fetch = vi.fn();

// jsdom implements neither, and both are reached by code under test.
globalThis.confirm = vi.fn(() => true);
Object.defineProperty(globalThis.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: vi.fn().mockResolvedValue(undefined) }
});

afterEach(() => {
  vi.clearAllMocks();
});
