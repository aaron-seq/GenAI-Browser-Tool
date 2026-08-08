/**
 * @file scripts/popup-main.js
 * @description Popup controller.
 *
 * Every button here maps to work that actually happens. Actions that cannot be
 * performed report why instead of showing a success toast — the previous version
 * had seven handlers that only displayed "Saved"/"Exported" and did nothing.
 */

class PopupInterface {
  constructor() {
    /** @type {any} */
    this.pageContent = null;
    /** @type {{ role: string, content: string }[]} */
    this.conversationHistory = [];
    this.isProcessing = false;
    this.lastSummary = null;
    this.lastTranslation = null;
    /** @type {any} */
    this.preferences = null;

    this.initialize();
  }

  async initialize() {
    this.setupEventListeners();
    try {
      await this.applyPreferences();
      await this.updateProviderStatus();
      await this.extractCurrentPageContent();
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Seed the controls from saved settings.
   *
   * Without this the options page's summary style, length, language, and theme
   * are stored but never applied, so changing them appears to do nothing.
   */
  async applyPreferences() {
    const response = await this.send('GET_USER_PREFERENCES', {});
    if (!response.success) return;

    this.preferences = response.data;
    setValue('summary-type', this.preferences.summaryType);
    setValue('target-language', this.preferences.targetLanguage);

    const length = /** @type {HTMLInputElement | null} */ (
      document.querySelector(
        `input[name="summary-length"][value="${this.preferences.summaryLength}"]`
      )
    );
    if (length) length.checked = true;

    if (this.preferences.theme === 'dark') {
      document.body.classList.add('dark-theme');
    }
  }

  async toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    await this.send('UPDATE_USER_PREFERENCES', { theme: isDark ? 'dark' : 'light' });
  }

  setupEventListeners() {
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', event => {
        const tab = /** @type {HTMLElement} */ (event.currentTarget).dataset.tab;
        if (tab) this.switchToTab(tab);
      });
    });

    on('settings-btn', 'click', () => chrome.runtime.openOptionsPage());
    on('theme-toggle', 'click', () => this.toggleTheme());

    on('generate-summary-btn', 'click', () => this.generateSummary());
    on('copy-summary-btn', 'click', () => this.copyToClipboard('summary-content'));
    on('export-summary-btn', 'click', () => this.exportSummary());

    on('send-chat-btn', 'click', () => this.sendChatMessage());
    on('chat-input', 'keydown', event => {
      const e = /** @type {KeyboardEvent} */ (event);
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendChatMessage();
      }
    });
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', event => {
        setValue('chat-input', /** @type {HTMLElement} */ (event.target).textContent || '');
        this.sendChatMessage();
      });
    });

    on('translate-btn', 'click', () => this.translateContent());
    on('swap-languages', 'click', () => this.swapLanguages());
    on('copy-translation-btn', 'click', () => this.copyToClipboard('translation-content'));

    document.querySelectorAll('.analyze-btn').forEach(button => {
      button.addEventListener('click', event => {
        const type = /** @type {HTMLElement} */ (event.currentTarget).dataset.type;
        if (type) this.runAnalysis(type);
      });
    });

    on('page-stats-btn', 'click', () => this.showPageStatistics());
    on('extract-links-btn', 'click', () => this.extractPageLinks());
    on('export-data-btn', 'click', () => this.exportUserData());
    on('close-tools-results', 'click', () => hide('tools-results'));
  }

  /** @param {string} tabName */
  switchToTab(tabName) {
    document.querySelectorAll('.tab-button.active, .tab-pane.active')
      .forEach(el => el.classList.remove('active'));
    document.querySelector(`.tab-button[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`${tabName}-tab`)?.classList.add('active');
    if (tabName === 'chat') document.getElementById('chat-input')?.focus();
  }

  // ------------------------------------------------------------------ content

  async extractCurrentPageContent() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!activeTab?.url?.startsWith('http')) {
      this.setPageInfo('This page cannot be read', 'Extensions cannot access browser or store pages');
      return;
    }

    this.setPageInfo(activeTab.title || 'Untitled', 'Reading page…');

    const response = await this.send('EXTRACT_PAGE_CONTENT', { tabId: activeTab.id });
    if (!response.success) {
      this.setPageInfo(activeTab.title || 'Untitled', response.error);
      return;
    }

    this.pageContent = response.data;
    const words = countWords(this.pageContent.mainText);
    this.setPageInfo(this.pageContent.title, `${words.toLocaleString()} words`);
  }

  // -------------------------------------------------------------------- tasks

  async generateSummary() {
    if (!this.requireContent()) return;

    await this.withLoading('Generating summary…', async () => {
      const response = await this.send('GENERATE_CONTENT_SUMMARY', {
        content: this.pageContent.mainText,
        summaryType: value('summary-type') || 'key-points',
        targetLength: checkedValue('summary-length') || 'medium'
      });

      if (!response.success) throw new Error(response.error);

      this.lastSummary = response.data;
      setHtml('summary-content', renderMarkdown(response.data.summary));
      setText('summary-provider', `${response.data.provider} · ${response.data.model}`);
      setText('summary-confidence', describeCoverage(response.data));
      show('summary-results');
    });
  }

  async sendChatMessage() {
    const question = value('chat-input').trim();
    if (!question || !this.requireContent()) return;

    setValue('chat-input', '');
    this.addChatMessage('user', question);

    await this.withLoading('Thinking…', async () => {
      const response = await this.send('ANSWER_CONTEXTUAL_QUESTION', {
        question,
        context: this.pageContent.mainText,
        conversationHistory: this.conversationHistory.slice(-6)
      });

      if (!response.success) {
        this.addChatMessage('assistant', response.error);
        return;
      }

      this.addChatMessage('assistant', response.data.answer);
      this.conversationHistory.push(
        { role: 'user', content: question },
        { role: 'assistant', content: response.data.answer }
      );
    });
  }

  async translateContent() {
    if (!this.requireContent()) return;

    await this.withLoading('Translating…', async () => {
      const translateWholePage = isChecked('translate-page');
      const response = await this.send('TRANSLATE_CONTENT', {
        text: translateWholePage
          ? this.pageContent.mainText
          : this.pageContent.mainText.slice(0, 2000),
        targetLanguage: value('target-language') || 'en',
        sourceLanguage: value('source-language') || 'auto'
      });

      if (!response.success) throw new Error(response.error);

      this.lastTranslation = response.data;
      setHtml('translation-content', renderMarkdown(response.data.text));
      setText('detected-language', `${response.data.provider} · ${response.data.model}`);
      setText('translation-confidence', response.data.truncated ? 'Truncated' : '');
      show('translation-results');
    });
  }

  /** @param {string} type */
  async runAnalysis(type) {
    if (!this.requireContent()) return;

    const target = document.getElementById(`${type}-result`);
    if (target) target.innerHTML = '<div class="loading-spinner"></div>';

    try {
      if (type === 'readability') {
        // Computed locally — no reason to spend an API call on arithmetic.
        const { score, level } = readabilityScore(this.pageContent.mainText);
        if (target) target.textContent = `Flesch reading ease ${score} — ${level}`;
        return;
      }

      /** @type {Record<string, string>} */
      const actions = {
        sentiment: 'ANALYZE_SENTIMENT',
        tags: 'GENERATE_SMART_TAGS',
        insights: 'EXTRACT_KEY_INSIGHTS',
        entities: 'EXTRACT_ENTITIES'
      };
      const action = actions[type];
      if (!action) throw new Error(`No analysis available for "${type}"`);

      const response = await this.send(action, { text: this.pageContent.mainText });
      if (!response.success) throw new Error(response.error);

      if (!target) return;
      if (type === 'sentiment') {
        target.textContent = `${response.data.sentiment} — ${response.data.reason}`;
      } else if (type === 'tags') {
        target.textContent = response.data.tags.join(', ');
      } else {
        target.innerHTML = renderMarkdown(response.data.text);
      }
    } catch (error) {
      /** @type {any} */
      const err = error;
      if (target) target.textContent = err.message;
    }
  }

  // -------------------------------------------------------------------- tools

  showPageStatistics() {
    if (!this.requireContent()) return;
    const text = this.pageContent.mainText;
    this.showToolsResult(`
      <ul>
        <li><strong>${countWords(text).toLocaleString()}</strong> words</li>
        <li><strong>${text.length.toLocaleString()}</strong> characters</li>
        <li><strong>${this.pageContent.headings.length}</strong> headings</li>
        <li>~<strong>${Math.max(1, Math.round(countWords(text) / 200))}</strong> min read</li>
        <li>Language: <strong>${escapeHtml(this.pageContent.language)}</strong></li>
      </ul>`);
  }

  async extractPageLinks() {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;

    try {
      const response = await chrome.tabs.sendMessage(activeTab.id, { action: 'extractLinks' });
      if (!response?.success) throw new Error(response?.error || 'Could not read links');

      const links = response.data.slice(0, 100);
      this.showToolsResult(
        `<p>${links.length} link(s)</p><ul>${links
          .map(/** @param {any} l */ l => `<li>${escapeHtml(l.text || l.href)}<br><small>${escapeHtml(l.href)}</small></li>`)
          .join('')}</ul>`
      );
    } catch (error) {
      /** @type {any} */
      const err = error;
      this.showToolsResult(`<p>${escapeHtml(err.message)}</p>`);
    }
  }

  async exportUserData() {
    const response = await this.send('EXPORT_USER_DATA', {});
    if (!response.success) {
      this.showToast(response.error, 'error');
      return;
    }
    downloadJson(response.data, `genai-export-${Date.now()}.json`);
    this.showToast('Export downloaded');
  }

  exportSummary() {
    if (!this.lastSummary) {
      this.showToast('Generate a summary first', 'error');
      return;
    }
    downloadJson(
      { ...this.lastSummary, url: this.pageContent?.url, title: this.pageContent?.title },
      `summary-${Date.now()}.json`
    );
  }

  // ------------------------------------------------------------------ helpers

  /**
   * @param {string} actionType
   * @param {any} payload
   * @returns {Promise<any>}
   */
  async send(actionType, payload) {
    try {
      return await chrome.runtime.sendMessage({
        actionType,
        requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        payload
      });
    } catch (error) {
      /** @type {any} */
      const err = error;
      return { success: false, error: `Extension service unavailable: ${err.message}` };
    }
  }

  async updateProviderStatus() {
    const response = await this.send('GET_PROVIDER_STATUS', {});
    const badge = document.getElementById('provider-indicator');
    if (!response.success) {
      setText('provider-name', 'Service unavailable');
      return;
    }

    const { provider, configured } = response.data;
    setText('provider-name', configured ? provider : `${provider} — no API key`);
    badge?.classList.toggle('active', configured);
    if (!configured) {
      this.showToast('Add an API key in Settings to enable AI features', 'error');
    }
  }

  /** @returns {boolean} */
  requireContent() {
    if (this.pageContent?.mainText) return true;
    this.showToast('No readable page content', 'error');
    return false;
  }

  /**
   * @param {string} message
   * @param {() => Promise<void>} work
   */
  async withLoading(message, work) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.showLoading(message);
    try {
      await work();
    } catch (error) {
      /** @type {any} */
      const err = error;
      this.showToast(err.message, 'error');
    } finally {
      this.isProcessing = false;
      this.hideLoading();
    }
  }

  /** @param {string} role @param {string} content */
  addChatMessage(role, content) {
    const history = document.getElementById('chat-history');
    if (!history) return;

    const message = document.createElement('div');
    message.className = `chat-message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = `${role}-avatar`;
    avatar.textContent = role === 'user' ? '👤' : '🤖';

    const body = document.createElement('div');
    body.className = 'message-content';
    body.innerHTML = renderMarkdown(content);

    message.append(avatar, body);
    history.appendChild(message);
    history.scrollTop = history.scrollHeight;
  }

  swapLanguages() {
    const source = /** @type {HTMLSelectElement | null} */ (document.getElementById('source-language'));
    const target = /** @type {HTMLSelectElement | null} */ (document.getElementById('target-language'));
    if (!source || !target || source.value === 'auto') return;
    [source.value, target.value] = [target.value, source.value];
  }

  /** @param {string} elementId */
  copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    navigator.clipboard.writeText(el.innerText)
      .then(() => this.showToast('Copied to clipboard'))
      .catch(() => this.showToast('Could not copy', 'error'));
  }

  /** @param {string} html */
  showToolsResult(html) {
    setHtml('tools-results-content', html);
    show('tools-results');
  }

  /** @param {string} title @param {string} status */
  setPageInfo(title, status) {
    setText('current-page-title', title);
    const info = document.getElementById('page-info');
    if (info) info.title = status;
  }

  /** @param {string} message @param {'info'|'error'|'success'} [type] */
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  }

  /** @param {string} message */
  showLoading(message) {
    setText('loading-text', message);
    show('loading-overlay', 'flex');
  }

  hideLoading() {
    hide('loading-overlay');
  }
}

// ------------------------------------------------------------------ utilities

/** @param {string} id @param {string} event @param {(e: Event) => void} handler */
function on(id, event, handler) {
  document.getElementById(id)?.addEventListener(event, handler);
}

/** @param {string} id @returns {string} */
function value(id) {
  const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
  return el ? el.value : '';
}

/** @param {string} id @param {string} v */
function setValue(id, v) {
  const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  if (el) el.value = v;
}

/** @param {string} name @returns {string} */
function checkedValue(name) {
  const el = /** @type {HTMLInputElement | null} */ (
    document.querySelector(`input[name="${name}"]:checked`)
  );
  return el ? el.value : '';
}

/** @param {string} id @returns {boolean} */
function isChecked(id) {
  const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  return Boolean(el?.checked);
}

/** @param {string} id @param {string} text */
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** @param {string} id @param {string} html */
function setHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

/** @param {string} id @param {string} [display] */
function show(id, display = 'block') {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

/** @param {string} id */
function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/** @param {string} text @returns {string} */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the small markdown subset the prompts ask for, after escaping.
 * Model output is derived from untrusted page text, so it is never trusted as HTML.
 *
 * @param {string} text
 * @returns {string}
 */
export function renderMarkdown(text) {
  if (!text) return '';
  return escapeHtml(text)
    .replace(/^[-*]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*<\/li>)/, '<ul>$1</ul>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

/**
 * Say how much of the page the summary actually covers.
 *
 * A summary of a 200,000-character page that silently used the first 24,000 is
 * indistinguishable from a complete one, so coverage is always stated.
 *
 * @param {{ sections?: number, droppedChars?: number }} data
 * @returns {string}
 */
export function describeCoverage(data) {
  const sections = data.sections || 1;
  const dropped = data.droppedChars || 0;

  if (dropped > 0) {
    return `Very long page — summarized the first ${sections} sections, ` +
      `${dropped.toLocaleString()} characters not included`;
  }
  if (sections > 1) {
    return `Whole page, summarized across ${sections} sections`;
  }
  return 'Whole page';
}

/** @param {string} text @returns {number} */
export function countWords(text) {
  const words = String(text || '').trim().match(/\S+/g);
  return words ? words.length : 0;
}

/**
 * Flesch reading ease, computed locally.
 *
 * @param {string} text
 * @returns {{ score: number, level: string }}
 */
export function readabilityScore(text) {
  const sentences = (text.match(/[.!?]+(\s|$)/g) || []).length || 1;
  const words = countWords(text) || 1;
  const syllables = (text.toLowerCase().match(/[aeiouy]{1,2}/g) || []).length || words;

  const score = Math.max(
    0,
    Math.min(100, Math.round(206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)))
  );

  const level = score >= 80 ? 'Easy'
    : score >= 60 ? 'Fairly easy'
      : score >= 40 ? 'Fairly difficult'
        : 'Difficult';

  return { score, level };
}

/** @param {any} data @param {string} filename */
function downloadJson(data, filename) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => new PopupInterface());
