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
  conversations: 'genai_conversation_history'
};

/** Entries kept per list. Oldest are dropped once the cap is passed. */
const LIMITS = {
  summaries: 1000,
  conversations: 500
};

/** History older than this is removed by the daily cleanup alarm. */
const RETENTION_DAYS = 90;

export class StorageService {
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
    const stored = await this.getStorageData(key, []);
    // A corrupted value (a string, an object) must not throw here and lose the
    // write; start a fresh list instead.
    const list = Array.isArray(stored) ? stored : [];

    const saved = { id: crypto.randomUUID(), ...entry };
    list.unshift(saved);
    list.splice(limit);

    await this.setStorageData(key, list);
    return saved.id;
  }

  /**
   * Everything held in local history.
   *
   * @returns {Promise<{ summaries: any[], conversations: any[], totalItems: number }>}
   */
  async getAnalysisHistory() {
    const [summaries, conversations] = await Promise.all([
      this.getStorageData(KEYS.summaries, []),
      this.getStorageData(KEYS.conversations, [])
    ]);

    return { summaries, conversations, totalItems: summaries.length + conversations.length };
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
      [KEYS.summaries, KEYS.conversations].map(async key => {
        const before = await this.getStorageData(key, []);
        const after = before.filter(isCurrent);
        if (after.length !== before.length) await this.setStorageData(key, after);
        return before.length - after.length;
      })
    );

    return { summariesRemoved: removed[0] ?? 0, conversationsRemoved: removed[1] ?? 0 };
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
