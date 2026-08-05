/**
 * @file options.js
 * @description Settings page.
 *
 * Every control maps to exactly one field in `user_preferences`, so what the
 * user types here is what the background service reads at request time.
 */

import { ConfigurationManager } from './core/configuration-manager.js';
import { PROVIDER_IDS } from './providers/ai-client.js';

class OptionsPage {
  constructor() {
    this.configManager = new ConfigurationManager();
    this.settings = this.configManager.defaultSettings;
    this.initialize();
  }

  async initialize() {
    this.settings = await this.configManager.getUserPreferences();
    this.render();
    this.setupEventListeners();
  }

  render() {
    const provider = document.querySelector(
      `input[name="primary-provider"][value="${this.settings.preferredProvider}"]`
    );
    if (provider) /** @type {HTMLInputElement} */ (provider).checked = true;

    for (const id of PROVIDER_IDS) {
      setValue(`${id}-key`, this.settings.apiKeys[id] || '');
      setValue(`${id}-model`, this.settings.models[id] || '');
    }

    setValue('summary-type-pref', this.settings.summaryType);
    setValue('summary-length-pref', this.settings.summaryLength);

    for (const [name, enabled] of Object.entries(this.settings.features)) {
      setChecked(name, Boolean(enabled));
    }
  }

  setupEventListeners() {
    document.querySelectorAll('input, select').forEach(element => {
      element.addEventListener('change', event => this.handleChange(event));
    });

    document.querySelectorAll('.nav-item').forEach(button => {
      button.addEventListener('click', event => this.switchSection(event));
    });

    document.getElementById('reset-settings')
      ?.addEventListener('click', () => this.resetSettings());
  }

  /** @param {Event} event */
  async handleChange(event) {
    const target = /** @type {HTMLInputElement | HTMLSelectElement} */ (event.target);
    const { id, name } = target;
    /** @type {any} */
    let update = null;

    if (name === 'primary-provider') {
      update = { preferredProvider: target.value };
    } else if (id.endsWith('-key')) {
      update = { apiKeys: { [id.slice(0, -4)]: target.value.trim() } };
    } else if (id.endsWith('-model')) {
      update = { models: { [id.slice(0, -6)]: target.value.trim() } };
    } else if (id === 'summary-type-pref') {
      update = { summaryType: target.value };
    } else if (id === 'summary-length-pref') {
      update = { summaryLength: target.value };
    } else if (target.type === 'checkbox') {
      update = { features: { [id]: /** @type {HTMLInputElement} */ (target).checked } };
    }

    if (!update) return;

    try {
      this.settings = await this.configManager.updateUserPreferences(update);
      this.showSaveIndicator();
    } catch (error) {
      /** @type {any} */
      const err = error;
      this.showSaveIndicator(`Could not save: ${err.message}`);
    }
  }

  async resetSettings() {
    if (!confirm('Reset all settings, including saved API keys?')) return;
    await this.configManager.setUserPreferences(this.configManager.defaultSettings);
    this.settings = await this.configManager.getUserPreferences();
    this.render();
    this.showSaveIndicator('Settings reset to defaults');
  }

  /** @param {Event} event */
  switchSection(event) {
    const target = /** @type {HTMLElement} */ (event.currentTarget);
    const sectionId = target.dataset.section;

    document.querySelectorAll('.nav-item.active, .settings-section.active')
      .forEach(el => el.classList.remove('active'));

    target.classList.add('active');
    document.getElementById(`${sectionId}-section`)?.classList.add('active');
  }

  /** @param {string} [message] */
  showSaveIndicator(message = 'Settings saved') {
    const indicator = document.getElementById('save-indicator');
    if (!indicator) return;
    const text = indicator.querySelector('.text');
    if (text) text.textContent = message;
    indicator.classList.add('visible');
    setTimeout(() => indicator.classList.remove('visible'), 2000);
  }
}

/** @param {string} id @param {string} value */
function setValue(id, value) {
  const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
  if (el) el.value = value;
}

/** @param {string} id @param {boolean} checked */
function setChecked(id, checked) {
  const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  if (el) el.checked = checked;
}

document.addEventListener('DOMContentLoaded', () => new OptionsPage());
