/**
 * @file services/storage-service.js
 * @description Local history: saved summaries and answered questions.
 *
 * Scope is deliberately narrow. This owns `chrome.storage.local` history and
 * nothing else. Settings live in `chrome.storage.sync` behind
 * `core/configuration-manager.js`, which is their single reader and writer.
 *
 * This file used to hold a second, competing copy of that: its own
 * `getUserPreferences()` read a `genai_user_preferences` key in
 * `chrome.storage.local` that nothing ever wrote, so it always returned its own
 * hardcoded defaults — including `aiProvider: 'chrome-ai'`, a provider removed
 * in 5.0.0. The only caller was `exportUserData()`, so every export reported
 * settings the user had never chosen and omitted the ones they had.
 */

const KEYS = {
  summaries: 'genai_summary_history',
  conversations: 'genai_conversation_history',
};

/** Entries kept per list. Oldest are dropped once the cap is passed. */
const LIMITS = {
  summaries: 1000,
  conversations: 500,
};

/** History older than this is removed by the daily cleanup alarm. */
const RETENTION_DAYS = 90;

export class StorageService {
  constructor() {
    /** @type {Map<string, Promise<any>>} */
    this.writes = new Map();
  }
  /**
   * Save one generated summary.
   *
   * @param {any} summary
   * @returns {Promise<string>} The new entry's id.
   */
  async saveSummaryHistory(summary) {
    return this.prepend(KEYS.summaries, LIMITS.summaries, summary);
  }

  /**
   * Save one question-and-answer exchange.
   *
   * @param {any} exchange
   * @returns {Promise<string>} The new entry's id.
   */
  async updateConversationHistory(exchange) {
    return this.prepend(KEYS.conversations, LIMITS.conversations, exchange);
  }

  /**
   * Add an entry to the front of a capped list.
   *
   * @param {string} key
   * @param {number} limit
   * @param {any} entry
   * @returns {Promise<string>}
   */
  async prepend(key, limit, entry) {
    return this.mutateList(key, list => {
      const saved = { ...entry, id: crypto.randomUUID() };
      list.unshift(saved);
      list.splice(limit);
      return { entries: list, result: saved.id };
    });
  }

  /** @param {string} identity */
  async clearDocumentChat(identity) {
    return this.mutateList(KEYS.conversations, list => {
      const entries = list.filter(entry => entry.documentKey !== identity);
      return { entries, result: list.length - entries.length };
    });
  }

  /**
   * Serialize read-modify-write operations so two open readers cannot lose turns.
   * The original rejected operation still reaches its caller; later writes can retry.
   * @param {string} key
   * @param {(entries: any[]) => {entries: any[], result: any, write?: boolean}} transform
   * @returns {Promise<any>}
   */
  mutateList(key, transform) {
    const work = async () => {
      // A failed read is not an empty history: writing over it would lose data.
      const values = await chrome.storage.local.get([key]);
      const stored = values[key];
      const before = Array.isArray(stored) ? stored : [];
      const { entries, result, write = true } = transform(before);
      if (write) await this.setStorageData(key, entries);
      return result;
    };
    const operation = (this.writes.get(key) || Promise.resolve()).then(
      work,
      work
    );
    this.writes.set(key, operation);
    return operation;
  }

  /**
   * Everything held in local history.
   *
   * @returns {Promise<{ summaries: any[], conversations: any[], totalItems: number }>}
   */
  async getAnalysisHistory() {
    const [summaries, conversations] = await Promise.all([
      this.getStorageData(KEYS.summaries, []),
      this.getStorageData(KEYS.conversations, []),
    ]);

    const summaryList = Array.isArray(summaries) ? summaries : [];
    const conversationList = Array.isArray(conversations) ? conversations : [];
    return {
      summaries: summaryList,
      conversations: conversationList,
      totalItems: summaryList.length + conversationList.length,
    };
  }

  /**
   * Drop history past the retention window.
   *
   * Entries with no `timestamp` are kept: an unreadable age is not evidence of
   * being old, and silently deleting a user's data on a guess is worse than
   * keeping a few stale rows.
   *
   * @returns {Promise<{ summariesRemoved: number, conversationsRemoved: number }>}
   */
  async cleanupOldData() {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    /** @param {any} item */
    const isCurrent = item => !item?.timestamp || item.timestamp > cutoff;

    const removed = await Promise.all(
      [KEYS.summaries, KEYS.conversations].map(key =>
        this.mutateList(key, before => {
          const after = before.filter(isCurrent);
          return {
            entries: after,
            result: before.length - after.length,
            write: after.length !== before.length,
          };
        })
      )
    );

    return {
      summariesRemoved: removed[0] ?? 0,
      conversationsRemoved: removed[1] ?? 0,
    };
  }

  /**
   * Read a key, falling back to `defaultValue` if it is absent or unreadable.
   *
   * @param {string} key
   * @param {any} defaultValue
   * @returns {Promise<any>}
   */
  async getStorageData(key, defaultValue = null) {
    try {
      const result = await chrome.storage.local.get([key]);
      return result[key] ?? defaultValue;
    } catch (error) {
      console.error(`Failed to read storage key "${key}"`, error);
      return defaultValue;
    }
  }

  /**
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  async setStorageData(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.error(`Failed to write storage key "${key}"`, error);
      throw error;
    }
  }
}
