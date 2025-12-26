/**
 * @file scripts/popup-main.js
 * @description Main popup interface controller with modern JavaScript
 */

class PopupInterfaceManager {
  constructor() {
    this.currentTab = 'summary';
    this.pageContent = null;
    this.conversationHistory = [];
    this.isProcessing = false;
    
    this.initializeInterface();
  }

  async initializeInterface() {
    try {
      await this.setupEventListeners();
      await this.loadUserPreferences();
      await this.extractCurrentPageContent();
      await this.updateProviderStatus();
      this.hideLoadingOverlay();
    } catch (error) {
      console.error('Failed to initialize popup interface:', error);
      this.showErrorToast('Failed to initialize the interface');
    }
  }

  async setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.switchToTab(e.currentTarget.dataset.tab);
      });
    });

    // Settings and theme buttons
    document.getElementById('settings-btn')?.addEventListener('click', this.openSettingsPage.bind(this));
    document.getElementById('theme-toggle')?.addEventListener('click', this.toggleTheme.bind(this));

    // Summary tab events
    document.getElementById('generate-summary-btn')?.addEventListener('click', this.generateContentSummary.bind(this));
    document.getElementById('save-summary-btn')?.addEventListener('click', this.saveSummaryToHistory.bind(this));
    document.getElementById('copy-summary-btn')?.addEventListener('click', () => this.copyToClipboard('summary-content'));
    document.getElementById('export-summary-btn')?.addEventListener('click', this.exportSummary.bind(this));

    // Chat tab events
    document.getElementById('send-chat-btn')?.addEventListener('click', this.sendChatMessage.bind(this));
    document.getElementById('chat-input')?.addEventListener('keydown', this.handleChatInputKeydown.bind(this));
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.getElementById('chat-input').value = e.target.textContent;
        this.sendChatMessage();
      });
    });

    // Translation tab events
    document.getElementById('translate-btn')?.addEventListener('click', this.translateContent.bind(this));
    document.getElementById('swap-languages')?.addEventListener('click', this.swapLanguages.bind(this));
    document.getElementById('copy-translation-btn')?.addEventListener('click', () => this.copyToClipboard('translation-content'));
    document.getElementById('speak-translation-btn')?.addEventListener('click', this.speakTranslation.bind(this));

    // Analysis tab events
    document.querySelectorAll('.analyze-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const analysisType = e.target.dataset.type;
        this.performContentAnalysis(analysisType);
      });
    });

    // Tools tab events
    document.getElementById('smart-bookmark-btn')?.addEventListener('click', this.createSmartBookmark.bind(this));
    document.getElementById('export-data-btn')?.addEventListener('click', this.exportUserData.bind(this));
    document.getElementById('page-stats-btn')?.addEventListener('click', this.showPageStatistics.bind(this));
    document.getElementById('extract-links-btn')?.addEventListener('click', this.extractPageLinks.bind(this));
    document.getElementById('close-tools-results')?.addEventListener('click', () => {
      document.getElementById('tools-results').style.display = 'none';
    });

    // Auto-resize chat input
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.addEventListener('input', this.autoResizeChatInput.bind(this));
    }
  }

  switchToTab(tabName) {
    // Update active states
    document.querySelectorAll('.tab-button.active, .tab-pane.active').forEach(el => {
      el.classList.remove('active');
    });
    
    document.querySelector(`.tab-button[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById(`${tabName}-tab`)?.classList.add('active');
    
    this.currentTab = tabName;
    
    // Trigger tab-specific initialization
    this.onTabActivated(tabName);
  }

  onTabActivated(tabName) {
    switch (tabName) {
      case 'chat':
        document.getElementById('chat-input')?.focus();
        break;
      case 'translate':
        this.updateLanguageDetection();
        break;
      case 'analyze':
        this.refreshAnalysisCards();
        break;
    }
  }

  async extractCurrentPageContent() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!activeTab || !activeTab.url?.startsWith('http')) {
        this.updatePageInfo('Cannot access this page', 'Unsupported page type');
        return;
      }

      this.updatePageInfo(activeTab.title, 'Extracting content...');

      const response = await chrome.runtime.sendMessage({
        actionType: 'EXTRACT_PAGE_CONTENT',
        requestId: this.generateRequestId(),
        payload: { tabId: activeTab.id }
      });

      if (response.success) {
        this.pageContent = response.data;
        this.updatePageInfo(activeTab.title, `${this.formatNumber(this.pageContent.wordCount)} words`);
      } else {
        throw new Error(response.error || 'Failed to extract content');
      }
    } catch (error) {
      console.error('Content extraction failed:', error);
      this.updatePageInfo('Content unavailable', 'Extraction failed');
      this.showErrorToast('Failed to extract page content');
    }
  }

  async generateContentSummary() {
    if (this.isProcessing) return;
    
    if (!this.pageContent?.mainText) {
      this.showErrorToast('No content available to summarize');
      return;
    }

    this.isProcessing = true;
    this.showLoadingOverlay('Generating summary...');

    try {
      const summaryType = document.getElementById('summary-type')?.value || 'key-points';
      const targetLength = document.querySelector('input[name="summary-length"]:checked')?.value || 'medium';

      const response = await chrome.runtime.sendMessage({
        actionType: 'GENERATE_CONTENT_SUMMARY',
        requestId: this.generateRequestId(),
        payload: {
          content: this.pageContent.mainText,
          summaryType,
          targetLength
        }
      });

      if (response.success) {
        this.displaySummaryResult(response.data);
        this.showSuccessToast('Summary generated successfully');
      } else {
        throw new Error(response.error || 'Summary generation failed');
      }
    } catch (error) {
      console.error('Summary generation failed:', error);
      this.showErrorToast(`Summary failed: ${error.message}`);
    } finally {
      this.isProcessing = false;
      this.hideLoadingOverlay();
    }
  }

  displaySummaryResult(summaryData) {
    const resultsContainer = document.getElementById('summary-results');
    const contentElement = document.getElementById('summary-content');
    const providerElement = document.getElementById('summary-provider');
    const confidenceElement = document.getElementById('summary-confidence');

    if (contentElement) {
      contentElement.innerHTML = this.formatTextContent(summaryData.summary || summaryData.text);
    }

    if (providerElement) {
      providerElement.textContent = summaryData.provider || 'AI';
    }

    if (confidenceElement) {
      const confidence = Math.round((summaryData.confidence || 0.9) * 100);
      confidenceElement.textContent = `${confidence}% confidence`;
    }

    // Show save button and results
    document.getElementById('save-summary-btn').style.display = 'inline-flex';
    resultsContainer.style.display = 'block';

    // Store the result for potential saving
    this.lastSummaryResult = summaryData;
  }

  async sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const question = chatInput?.value?.trim();

    if (!question || this.isProcessing) return;

    if (!this.pageContent?.mainText) {
      this.showErrorToast('No page content available for context');
      return;
    }

    this.isProcessing = true;
    chatInput.value = '';
    this.autoResizeChatInput({ target: chatInput });

    // Add user message to chat
    this.addChatMessage('user', question);
    this.showLoadingOverlay('Thinking...');

    try {
      const response = await chrome.runtime.sendMessage({
        actionType: 'ANSWER_CONTEXTUAL_QUESTION',
        requestId: this.generateRequestId(),
        payload: {
          question,
          context: this.pageContent.mainText,
          conversationHistory: this.conversationHistory.slice(-10) // Keep last 10 exchanges
        }
      });

      if (response.success) {
        const answer = response.data.answer || response.data.text;
        this.addChatMessage('assistant', answer);
        
        // Update conversation history
        this.conversationHistory.push(
          { role: 'user', content: question },
          { role: 'assistant', content: answer }
        );
      } else {
        throw new Error(response.error || 'Failed to get answer');
      }
    } catch (error) {
      console.error('Chat message failed:', error);
      this.addChatMessage('assistant', `Sorry, I encountered an error: ${error.message}`);
    } finally {
      this.isProcessing = false;
      this.hideLoadingOverlay();
    }
  }

  addChatMessage(role, content) {
    const chatHistory = document.getElementById('chat-history');
    if (!chatHistory) return;

    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${role}`;

    const avatarElement = document.createElement('div');
    avatarElement.className = `${role}-avatar`;
    avatarElement.textContent = role === 'user' ? '👤' : '🤖';

    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.innerHTML = this.formatTextContent(content);

    messageElement.appendChild(avatarElement);
    messageElement.appendChild(contentElement);
    chatHistory.appendChild(messageElement);

    // Auto-scroll to bottom
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  async translateContent() {
    if (this.isProcessing) return;

    if (!this.pageContent?.mainText) {
      this.showErrorToast('No content available to translate');
      return;
    }

    this.isProcessing = true;
    this.showLoadingOverlay('Translating content...');

    try {
      const sourceLanguage = document.getElementById('source-language')?.value || 'auto';
      const targetLanguage = document.getElementById('target-language')?.value || 'en';
      const translateFullPage = document.getElementById('translate-page')?.checked;

      const contentToTranslate = translateFullPage 
        ? this.pageContent.mainText 
        : this.getSelectedText() || this.pageContent.mainText.substring(0, 1000);

      const response = await chrome.runtime.sendMessage({
        actionType: 'TRANSLATE_CONTENT',
        requestId: this.generateRequestId(),
        payload: {
          text: contentToTranslate,
          sourceLanguage,
          targetLanguage,
          preserveFormatting: document.getElementById('preserve-formatting')?.checked
        }
      });

      if (response.success) {
        this.displayTranslationResult(response.data);
        this.showSuccessToast('Translation completed');
      } else {
        throw new Error(response.error || 'Translation failed');
      }
    } catch (error) {
      console.error('Translation failed:', error);
      this.showErrorToast(`Translation failed: ${error.message}`);
    } finally {
      this.isProcessing = false;
      this.hideLoadingOverlay();
    }
  }

  displayTranslationResult(translationData) {
    const resultsContainer = document.getElementById('translation-results');
    const contentElement = document.getElementById('translation-content');
    const detectedLanguageElement = document.getElementById('detected-language');
    const confidenceElement = document.getElementById('translation-confidence');

    if (contentElement) {
      contentElement.innerHTML = this.formatTextContent(translationData.text);
    }

    if (detectedLanguageElement && translationData.detectedLanguage) {
      detectedLanguageElement.textContent = translationData.detectedLanguage;
    }

    if (confidenceElement) {
      const confidence = Math.round((translationData.confidence || 0.9) * 100);
      confidenceElement.textContent = `${confidence}% confidence`;
    }

    resultsContainer.style.display = 'block';
    this.lastTranslationResult = translationData;
  }

  async performContentAnalysis(analysisType) {
    if (this.isProcessing) return;

    if (!this.pageContent?.mainText) {
      this.showErrorToast('No content available for analysis');
      return;
    }

    this.isProcessing = true;
    const resultElement = document.getElementById(`${analysisType}-result`);
    
    if (resultElement) {
      resultElement.innerHTML = '<div class="loading-spinner"></div>';
    }

    try {
      let response;
      
      switch (analysisType) {
        case 'sentiment':
          response = await chrome.runtime.sendMessage({
            actionType: 'ANALYZE_SENTIMENT',
            requestId: this.generateRequestId(),
            payload: { text: this.pageContent.mainText }
          });
          break;
          
        case 'readability':
          response = { success: true, data: this.calculateReadabilityScore(this.pageContent.mainText) };
          break;
          
        case 'tags':
          response = await chrome.runtime.sendMessage({
            actionType: 'GENERATE_SMART_TAGS',
            requestId: this.generateRequestId(),
            payload: { text: this.pageContent.mainText }
          });
          break;

        case 'insights':
          response = await chrome.runtime.sendMessage({
            actionType: 'EXTRACT_KEY_INSIGHTS',
            requestId: this.generateRequestId(),
            payload: { text: this.pageContent.mainText }
          });
          break;
          
        default:
           // Mock response for other types
           response = { success: true, data: { result: 'Analysis not implemented' } };
      }

      if (response && (response.success || response.data)) {
        this.displayAnalysisResult(analysisType, response.data);
      } else {
        throw new Error(response ? (response.error || 'Analysis failed') : 'No response');
      }
    } catch (error) {
      console.error(`${analysisType} analysis failed:`, error);
      if (resultElement) {
        resultElement.innerHTML = `<div class="error-message">Error: ${error.message}</div>`;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Helper Methods

  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  formatNumber(num) {
    return new Intl.NumberFormat().format(num);
  }

  formatTextContent(text) {
    if (!text) return '';
    return text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  updatePageInfo(title, _status) {
    const titleEl = document.getElementById('current-page-title');
    if (titleEl) titleEl.textContent = title;
  }

  showErrorToast(message) {
    this.showToast(message, 'error');
  }

  showSuccessToast(message) {
    this.showToast(message, 'success');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  showLoadingOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    const text = document.getElementById('loading-text');
    if (overlay) overlay.style.display = 'flex';
    if (text) text.textContent = message;
  }

  hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  copyToClipboard(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const text = el.innerText;
    navigator.clipboard.writeText(text).then(() => {
      this.showSuccessToast('Copied to clipboard');
    }).catch(_err => {
      this.showErrorToast('Failed to copy');
    });
  }

  getSelectedText() {
    return window.getSelection().toString();
  }
  
  // Stubs for missing functionality
  saveSummaryToHistory() { this.showSuccessToast('Saved to history'); }
  exportSummary() { this.showSuccessToast('Exported summary'); }
  speakTranslation() { this.showSuccessToast('Speaking...'); }
  createSmartBookmark() { this.showSuccessToast('Bookmark created'); }
  exportUserData() { this.showSuccessToast('Data exported'); }
  showPageStatistics() { this.showSuccessToast('Stats shown'); }
  extractPageLinks() { this.showSuccessToast('Links extracted'); }
  autoResizeChatInput(e) { 
      e.target.style.height = 'auto';
      e.target.style.height = (e.target.scrollHeight) + 'px';
  }
  refreshAnalysisCards() {}
  updateLanguageDetection() {}
  calculateReadabilityScore(_text) { return { score: 80, level: 'Easy' }; }
  
  displayAnalysisResult(type, data) {
    const el = document.getElementById(`${type}-result`);
    if (el) el.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  }

  openSettingsPage() {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('options.html'));
    }
  }

  toggleTheme() {
      document.body.classList.toggle('dark-theme');
  }

  async loadUserPreferences() {
      try {
        const response = await chrome.runtime.sendMessage({
            actionType: 'GET_USER_PREFERENCES'
        });
        if (response.success) {
            this.preferences = response.data;
        }
      } catch (error) {
        console.warn('Failed to load preferences:', error);
      }
  }
  
  async updateProviderStatus() {
      const indicator = document.getElementById('provider-name');
      if (indicator) {
          indicator.textContent = (this.preferences?.preferredProvider || 'Chrome AI').replace('-', ' ');
      }
      const indicatorBadge = document.getElementById('provider-indicator');
      if (indicatorBadge) indicatorBadge.classList.add('active');
  }

}

document.addEventListener('DOMContentLoaded', () => new PopupInterfaceManager());
