/**
 * @file core/configuration-manager.js
 * @description Single source of truth for user settings.
 *
 * Everything the extension reads at runtime lives under one `user_preferences`
 * key. Providers previously read `chrome.storage.sync.get(['openai_api_key'])`
 * while the options page wrote `user_preferences.apiKeys.openai`, so a key the
 * user entered was never found. One shape, one reader, one writer.
 */

import { PROVIDERS, PROVIDER_IDS, AIClient } from '../providers/ai-client.js';

const STORAGE_KEY = 'user_preferences';

/**
 * API keys live in `chrome.storage.sync`, which syncs to the user's Google
 * account and is readable by anything running in the extension's own context.
 * That is the same trust boundary as the extension itself, but it is not a
 * secret store — documented in docs/SECURITY.md.
 */
export class ConfigurationManager {
  constructor() {
    this.defaultSettings = {
      preferredProvider: 'anthropic',
      /** @type {Record<string, string>} */
      models: {},
      /** @type {Record<string, string>} */
      apiKeys: {},
      summaryLength: 'medium',
      summaryType: 'key-points',
      theme: 'auto',
      targetLanguage: 'en',
      /** @type {Record<string, boolean>} */
      features: {
        contextMenus: true,
        notifications: true,
        saveHistory: true
      }
    };
  }

  /**
   * Seed storage on first run.
   *
   * Checks raw storage rather than `getUserPreferences()` — that merges
   * defaults in, so any flag it returns is always present and can never
   * distinguish a first run from a later one.
   */
  async initialize() {
    const stored = await chrome.storage.sync.get([STORAGE_KEY]);
    if (!stored[STORAGE_KEY]) {
      await this.setUserPreferences(this.defaultSettings);
    }
  }

  /**
   * Read settings, merged over defaults so a preferences object written by an
   * older version never leaves a field undefined for a caller.
   *
   * @returns {Promise<any>}
   */
  async getUserPreferences() {
    try {
      const result = await chrome.storage.sync.get([STORAGE_KEY]);
      return this.withDefaults(result[STORAGE_KEY]);
    } catch (error) {
      console.error('Failed to read user preferences:', error);
      return { ...this.defaultSettings };
    }
  }

  /**
   * @param {any} stored
   * @returns {any}
   */
  withDefaults(stored) {
    if (!stored) return { ...this.defaultSettings };
    return {
      ...this.defaultSettings,
      ...stored,
      apiKeys: { ...this.defaultSettings.apiKeys, ...(stored.apiKeys || {}) },
      models: { ...this.defaultSettings.models, ...(stored.models || {}) },
      features: { ...this.defaultSettings.features, ...(stored.features || {}) }
    };
  }

  /**
   * @param {any} newSettings
   * @returns {Promise<any>}
   */
  async updateUserPreferences(newSettings) {
    const current = await this.getUserPreferences();
    const updated = {
      ...current,
      ...newSettings,
      apiKeys: { ...current.apiKeys, ...(newSettings.apiKeys || {}) },
      models: { ...current.models, ...(newSettings.models || {}) },
      features: { ...current.features, ...(newSettings.features || {}) },
      updatedAt: Date.now()
    };
    await chrome.storage.sync.set({ [STORAGE_KEY]: updated });
    return updated;
  }

  /** @param {any} settings */
  async setUserPreferences(settings) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: settings });
  }

  /**
   * Build a client for the provider the user selected.
   *
   * Throws `AIError('MISSING_API_KEY')` when unconfigured — the caller surfaces
   * that verbatim so the user is told to open the options page rather than
   * being handed a plausible-looking answer from somewhere else.
   *
   * @returns {Promise<AIClient>}
   */
  async createAIClient() {
    const settings = await this.getUserPreferences();
    const provider = PROVIDERS[settings.preferredProvider] ? settings.preferredProvider : 'anthropic';
    return new AIClient({
      provider,
      apiKey: settings.apiKeys[provider],
      model: settings.models[provider]
    });
  }

  /**
   * Which providers currently have a key. Drives the popup's status badge.
   *
   * @returns {Promise<{ provider: string, configured: boolean, providers: Record<string, boolean> }>}
   */
  async getProviderStatus() {
    const settings = await this.getUserPreferences();
    /** @type {Record<string, boolean>} */
    const providers = {};
    for (const id of PROVIDER_IDS) {
      providers[id] = Boolean(settings.apiKeys[id]);
    }
    return {
      provider: settings.preferredProvider,
      configured: Boolean(settings.apiKeys[settings.preferredProvider]),
      providers
    };
  }
}
