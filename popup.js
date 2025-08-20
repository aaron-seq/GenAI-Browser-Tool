// GenAI Browser Tool - Advanced Popup Script
// Modern popup interface with comprehensive AI features

class PopupManager {
  constructor() {
    this.currentTab = 'summarize';
    this.isLoading = false;
    this.conversationHistory = [];
    this.currentProvider = 'chrome-ai';
    this.settings = {};
    this.pageContent = null;
    
    this.init();
  }

  async init() {
    try {
      await this.loadSettings();
      await this.loadPageContent();
      this.setupEventListeners();
      this.initializeUI();
      
      console.log('Popup initialized successfully');
    } catch (error) {
      console.error('Error initializing popup:', error);
      this.showError('Failed to initialize application');
    }
  }

  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'get-settings' });
      if (response.success) {
        this.settings = response.data;
        this.currentProvider = this.settings.preferredProvider || 'chrome-ai';
        this.updateProviderDisplay();
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async loadPageContent() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
      
      if (response && response.success) {
        this.pageContent = response.data;
        this.updatePageInfo();
      }
    } catch (error) {
      console.log('Could not load page content:', error);
      // This is expected for chrome:// pages and other restricted pages
    }
  }

  setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.switchTab(e.target.closest('.tab-button').dataset.tab);
      });
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
      this.toggleTheme();
    });

    // Settings button
    document.getElementById('settings-button').addEventListener('click', () => {
      this.openSettings();
    });

    // Summarize functionality
    document.getElementById('summarize-page').addEventListener('click', () => {
      this.summarizePage();
    });

    document.getElementById('summarize-selection').addEventListener('click', () => {
      this.summarizeSelection();
    });

    // Q&A functionality
    document.getElementById('ask-button').addEventListener('click', () => {
      this.askQuestion();
    });

    document.getElementById('question-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.askQuestion();
      }
    });

    // Suggestion chips
    document.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const question = e.target.dataset.question;
        document.getElementById('question-input').value = question;
        this.askQuestion();
      });
    });

    // Translation functionality
    document.getElementById('translate-page').addEventListener('click', () => {
      this.translatePage();
    });

    document.getElementById('translate-selection').addEventListener('click', () => {
      this.translateSelection();
    });

    // Analysis functionality
    document.getElementById('analyze-sentiment').addEventListener('click', () => {
      this.analyzeSentiment();
    });

    document.getElementById('analyze-readability').addEventListener('click', () => {
      this.analyzeReadability();
    });

    document.getElementById('extract-keywords').addEventListener('click', () => {
      this.extractKeywords();
    });

    document.getElementById('analyze-structure').addEventListener('click', () => {
      this.analyzeStructure();
    });

    // Tools functionality
    document.getElementById('calculate-reading-time').addEventListener('click', () => {
      this.calculateReadingTime();
    });

    document.getElementById('count-words').addEventListener('click', () => {
      this.countWords();
    });

    document.getElementById('extract-links').addEventListener('click', () => {
      this.extractLinks();
    });

    document.getElementById('extract-images').addEventListener('click', () => {
      this.extractImages();
    });

    document.getElementById('export-data').addEventListener('click', () => {
      this.exportData();
    });

    document.getElementById('generate-tags').addEventListener('click', () => {
      this.generateTags();
    });

    // Copy and save actions
    document.getElementById('copy-summary')?.addEventListener('click', () => {
      this.copyToClipboard('summary-text');
    });

    document.getElementById('save-summary')?.addEventListener('click', () => {
      this.saveBookmark('summary');
    });

    document.getElementById('copy-translation')?.addEventListener('click', () => {
      this.copyToClipboard('translation-text');
    });
  }

  initializeUI() {
    // Initialize theme
    const isDarkMode = this.settings.ui?.theme === 'dark' || 
                      (this.settings.ui?.theme === 'auto' && 
                       window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    document.body.classList.toggle('dark-theme', isDarkMode);
    
    // Update theme toggle icon
    const themeIcon = document.querySelector('#theme-toggle .icon');
    themeIcon.textContent = isDarkMode ? '☀️' : '🌙';

    // Set default values from settings
    if (this.settings.summarization) {
      document.getElementById('summary-type').value = this.settings.summarization.defaultType;
      document.querySelector(`input[name="summary-length"][value="${this.settings.summarization.defaultLength}"]`).checked = true;
    }

    // Initialize page info if available
    if (this.pageContent) {
      this.updatePageInfo();
    }
  }

  switchTab(tabName) {
    // Update button states
    document.querySelectorAll('.tab-button').forEach(button => {
      button.classList.toggle('active', button.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `${tabName}-tab`);
    });

    this.currentTab = tabName;
  }

  toggleTheme() {
    const isDarkMode = document.body.classList.toggle('dark-theme');
    const themeIcon = document.querySelector('#theme-toggle .icon');
    themeIcon.textContent = isDarkMode ? '☀️' : '🌙';

    // Save theme preference
    this.updateSettings({ ui: { ...this.settings.ui, theme: isDarkMode ? 'dark' : 'light' } });
  }

  openSettings() {
    chrome.runtime.openOptionsPage();
  }

  updatePageInfo() {
    if (!this.pageContent) return;

    // Update reading time and word count immediately
    document.getElementById('reading-time').textContent = `${this.pageContent.readingTime} min`;
    document.getElementById('word-count').textContent = `${this.pageContent.wordCount} words`;
  }

  updateProviderDisplay() {
    const providerNames = {
      'chrome-ai': 'Chrome AI',
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'gemini': 'Gemini'
    };
    
    document.getElementById('current-provider').textContent = 
      providerNames[this.currentProvider] || this.currentProvider;
  }

  // Summarization methods
  async summarizePage() {
    if (!this.pageContent) {
      this.showError('No page content available');
      return;
    }

    this.showLoading('Generating summary...');

    try {
      const summaryType = document.getElementById('summary-type').value;
      const summaryLength = document.querySelector('input[name="summary-length"]:checked').value;

      const response = await chrome.runtime.sendMessage({
        action: 'summarize',
        data: {
          text: this.pageContent.text,
          type: summaryType,
          length: summaryLength,
          context: `Page title: ${this.pageContent.title}`
        }
      });

      if (response.success) {
        this.displaySummary(response.data);
        this.showSuccess('Summary generated successfully');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Summarization error:', error);
      this.showError('Failed to generate summary');
    } finally {
      this.hideLoading();
    }
  }

  async summarizeSelection() {
    this.showLoading('Getting selected text...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractSelection' });

      if (response && response.success && response.data) {
        const selection = response.data;
        
        const summaryType = document.getElementById('summary-type').value;
        const summaryLength = document.querySelector('input[name="summary-length"]:checked').value;

        const summaryResponse = await chrome.runtime.sendMessage({
          action: 'summarize',
          data: {
            text: selection.text,
            type: summaryType,
            length: summaryLength,
            context: `Selected text from: ${this.pageContent?.title || 'webpage'}`
          }
        });

        if (summaryResponse.success) {
          this.displaySummary(summaryResponse.data, 'Selection Summary');
          this.showSuccess('Selection summarized successfully');
        } else {
          throw new Error(summaryResponse.error);
        }
      } else {
        this.showError('No text selected');
      }
    } catch (error) {
      console.error('Selection summarization error:', error);
      this.showError('Failed to summarize selection');
    } finally {
      this.hideLoading();
    }
  }

  displaySummary(summary, title = 'Summary') {
    const summaryContainer = document.getElementById('summary-result');
    const summaryText = document.getElementById('summary-text');
    const summaryMetadata = document.getElementById('summary-metadata');

    summaryContainer.querySelector('.result-header h3').textContent = title;
    summaryText.innerHTML = this.formatText(summary);

    // Add metadata
    if (this.pageContent) {
      summaryMetadata.innerHTML = `
        <div class="metadata-item">
          <span class="label">Reading Time:</span>
          <span class="value">${this.pageContent.readingTime} min</span>
        </div>
        <div class="metadata-item">
          <span class="label">Word Count:</span>
          <span class="value">${this.pageContent.wordCount} words</span>
        </div>
        <div class="metadata-item">
          <span class="label">Generated:</span>
          <span class="value">${new Date().toLocaleTimeString()}</span>
        </div>
      `;
    }
  }

  // Q&A methods
  async askQuestion() {
    const questionInput = document.getElementById('question-input');
    const question = questionInput.value.trim();

    if (!question) {
      this.showError('Please enter a question');
      return;
    }

    if (!this.pageContent) {
      this.showError('No page content available for context');
      return;
    }

    this.showLoading('Thinking...');
    this.addChatMessage(question, 'user');
    questionInput.value = '';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'ask-question',
        data: {
          question,
          context: this.pageContent.text,
          conversationHistory: this.conversationHistory.slice(-10) // Keep last 10 messages
        }
      });

      if (response.success) {
        this.addChatMessage(response.data, 'assistant');
        this.conversationHistory.push(
          { role: 'user', content: question },
          { role: 'assistant', content: response.data }
        );
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Q&A error:', error);
      this.addChatMessage('Sorry, I encountered an error while processing your question.', 'assistant', true);
    } finally {
      this.hideLoading();
    }
  }

  addChatMessage(content, role, isError = false) {
    const chatHistory = document.getElementById('chat-history');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role} ${isError ? 'error' : ''}`;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-role">${role === 'user' ? 'You' : 'AI Assistant'}</span>
        <span class="message-time">${timestamp}</span>
      </div>
      <div class="message-content">${this.formatText(content)}</div>
      <div class="message-actions">
        <button class="action-button copy-message" data-content="${content}">
          <span class="icon">📋</span>
        </button>
      </div>
    `;

    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Add copy functionality
    messageDiv.querySelector('.copy-message').addEventListener('click', (e) => {
      this.copyText(e.target.dataset.content);
    });

    // Remove welcome message if it exists
    const welcome = chatHistory.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }
  }

  // Translation methods
  async translatePage() {
    if (!this.pageContent) {
      this.showError('No page content available');
      return;
    }

    this.showLoading('Translating page...');

    try {
      const sourceLanguage = document.getElementById('source-language').value;
      const targetLanguage = document.getElementById('target-language').value;

      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        data: {
          text: this.pageContent.text.substring(0, 5000), // Limit for performance
          sourceLanguage,
          targetLanguage
        }
      });

      if (response.success) {
        this.displayTranslation(response.data);
        this.showSuccess('Page translated successfully');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Translation error:', error);
      this.showError('Failed to translate page');
    } finally {
      this.hideLoading();
    }
  }

  async translateSelection() {
    this.showLoading('Getting selected text...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractSelection' });

      if (response && response.success && response.data) {
        const selection = response.data;
        const sourceLanguage = document.getElementById('source-language').value;
        const targetLanguage = document.getElementById('target-language').value;

        const translationResponse = await chrome.runtime.sendMessage({
          action: 'translate',
          data: {
            text: selection.text,
            sourceLanguage,
            targetLanguage
          }
        });

        if (translationResponse.success) {
          this.displayTranslation(translationResponse.data);
          this.showSuccess('Selection translated successfully');
        } else {
          throw new Error(translationResponse.error);
        }
      } else {
        this.showError('No text selected');
      }
    } catch (error) {
      console.error('Translation error:', error);
      this.showError('Failed to translate selection');
    } finally {
      this.hideLoading();
    }
  }

  displayTranslation(translation) {
    const translationText = document.getElementById('translation-text');
    translationText.innerHTML = this.formatText(translation);
  }

  // Analysis methods
  async analyzeSentiment() {
    if (!this.pageContent) {
      this.showError('No page content available');
      return;
    }

    this.showLoading('Analyzing sentiment...');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'analyze-sentiment',
        data: {
          text: this.pageContent.text.substring(0, 3000) // Limit for performance
        }
      });

      if (response.success) {
        const sentiment = response.data;
        document.getElementById('sentiment-value').textContent = 
          `${sentiment.label} (${sentiment.confidence}%)`;
        
        // Update card color based on sentiment
        const card = document.getElementById('sentiment-card');
        card.className = `analysis-card sentiment-${sentiment.label.toLowerCase()}`;
        
        this.showSuccess('Sentiment analyzed successfully');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      this.showError('Failed to analyze sentiment');
    } finally {
      this.hideLoading();
    }
  }

  async analyzeReadability() {
    if (!this.pageContent) {
      this.showError('No page content available');
      return;
    }

    this.showLoading('Analyzing readability...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'analyzeReadability' });

      if (response && response.success) {
        const readability = response.data;
        document.getElementById('readability-value').textContent = readability.readingLevel;
        
        this.displayAnalysisDetails('readability', readability);
        this.showSuccess('Readability analyzed successfully');
      } else {
        throw new Error(response.error || 'Failed to analyze readability');
      }
    } catch (error) {
      console.error('Readability analysis error:', error);
      this.showError('Failed to analyze readability');
    } finally {
      this.hideLoading();
    }
  }

  async extractKeywords() {
    if (!this.pageContent) {
      this.showError('No page content available');
      return;
    }

    this.showLoading('Extracting keywords...');

    try {
      // Simple keyword extraction (can be enhanced with AI)
      const words = this.pageContent.text.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 3);

      const wordCount = {};
      words.forEach(word => {
        wordCount[word] = (wordCount[word] || 0) + 1;
      });

      const keywords = Object.entries(wordCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([word]) => word);

      document.getElementById('keywords-count').textContent = keywords.length;
      this.displayAnalysisDetails('keywords', { keywords, total: keywords.length });
      this.showSuccess('Keywords extracted successfully');
    } catch (error) {
      console.error('Keyword extraction error:', error);
      this.showError('Failed to extract keywords');
    } finally {
      this.hideLoading();
    }
  }

  async analyzeStructure() {
    if (!this.pageContent) {
      this.showError('No page content available');
      return;
    }

    this.showLoading('Analyzing page structure...');

    try {
      const structure = {
        headings: this.pageContent.headings?.length || 0,
        paragraphs: this.pageContent.paragraphs?.length || 0,
        lists: this.pageContent.lists?.length || 0,
        links: this.pageContent.links?.length || 0,
        images: this.pageContent.images?.length || 0
      };

      // Calculate structure score (simple heuristic)
      let score = 0;
      if (structure.headings > 0) score += 20;
      if (structure.paragraphs > 2) score += 30;
      if (structure.lists > 0) score += 15;
      if (structure.links > 0) score += 15;
      if (structure.images > 0) score += 10;
      if (structure.headings > 1 && structure.paragraphs > structure.headings) score += 10;

      document.getElementById('structure-score').textContent = `${score}/100`;
      this.displayAnalysisDetails('structure', { ...structure, score });
      this.showSuccess('Page structure analyzed successfully');
    } catch (error) {
      console.error('Structure analysis error:', error);
      this.showError('Failed to analyze page structure');
    } finally {
      this.hideLoading();
    }
  }

  displayAnalysisDetails(type, data) {
    const detailsContainer = document.getElementById('analysis-details');
    
    let content = '';
    switch (type) {
      case 'readability':
        content = `
          <h3>📚 Readability Analysis</h3>
          <div class="analysis-grid">
            <div class="analysis-metric">
              <span class="metric-label">Reading Level:</span>
              <span class="metric-value">${data.readingLevel}</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Flesch Score:</span>
              <span class="metric-value">${data.fleschScore}</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Grade Level:</span>
              <span class="metric-value">${data.gradeLevel}</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Avg Words/Sentence:</span>
              <span class="metric-value">${data.avgWordsPerSentence}</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Total Sentences:</span>
              <span class="metric-value">${data.sentences}</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Total Words:</span>
              <span class="metric-value">${data.words}</span>
            </div>
          </div>
        `;
        break;
      
      case 'keywords':
        content = `
          <h3>🔤 Top Keywords</h3>
          <div class="keywords-list">
            ${data.keywords.map(keyword => `<span class="keyword-tag">${keyword}</span>`).join('')}
          </div>
        `;
        break;
      
      case 'structure':
        content = `
          <h3>🏗️ Page Structure Analysis</h3>
          <div class="analysis-grid">
            <div class="analysis-metric">
              <span class="metric-label">Structure Score:</span>
              <span class="metric-value">${data.score}/100</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Headings:</span>
              <span class="metric-value">${data.headings}</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Paragraphs:</span>
              <span class="metric-value">${data.paragraphs}</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Lists:</span>
              <span class="metric-value">${data.lists}</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Links:</span>
              <span class="metric-value">${data.links}</span>
            </div>
            <div class="analysis-metric">
              <span class="metric-label">Images:</span>
              <span class="metric-value">${data.images}</span>
            </div>
          </div>
        `;
        break;
    }
    
    detailsContainer.innerHTML = content;
  }

  // Tools methods
  calculateReadingTime() {
    if (!this.pageContent) {
      this.showError('No page content available');
      return;
    }

    const readingTime = this.pageContent.readingTime;
    document.getElementById('reading-time').textContent = `${readingTime} min`;
    this.showSuccess('Reading time calculated');
  }

  countWords() {
    if (!this.pageContent) {
      this.showError('No page content available');
      return;
    }

    const wordCount = this.pageContent.wordCount;
    const charCount = this.pageContent.text.length;
    
    document.getElementById('word-count').innerHTML = `
      <div>${wordCount} words</div>
      <div class="sub-metric">${charCount} characters</div>
    `;
    this.showSuccess('Words counted');
  }

  async extractLinks() {
    this.showLoading('Extracting links...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractLinks' });

      if (response && response.success) {
        const links = response.data;
        document.getElementById('links-count').innerHTML = `
          <div>${links.length} links</div>
          <div class="sub-metric">${links.filter(l => l.isExternal).length} external</div>
        `;
        this.showSuccess('Links extracted');
      } else {
        throw new Error('Failed to extract links');
      }
    } catch (error) {
      console.error('Link extraction error:', error);
      this.showError('Failed to extract links');
    } finally {
      this.hideLoading();
    }
  }

  async extractImages() {
    this.showLoading('Extracting images...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractImages' });

      if (response && response.success) {
        const images = response.data;
        document.getElementById('images-count').innerHTML = `
          <div>${images.length} images</div>
          <div class="sub-metric">${images.filter(i => i.alt).length} with alt text</div>
        `;
        this.showSuccess('Images extracted');
      } else {
        throw new Error('Failed to extract images');
      }
    } catch (error) {
      console.error('Image extraction error:', error);
      this.showError('Failed to extract images');
    } finally {
      this.hideLoading();
    }
  }

  async exportData() {
    if (!this.pageContent) {
      this.showError('No data to export');
      return;
    }

    this.showLoading('Preparing export...');

    try {
      const format = document.getElementById('export-format').value;
      
      const exportData = {
        url: this.pageContent.url,
        title: this.pageContent.title,
        extractedAt: new Date().toISOString(),
        content: this.pageContent,
        analysis: {
          wordCount: this.pageContent.wordCount,
          readingTime: this.pageContent.readingTime,
          language: this.pageContent.language
        }
      };

      const response = await chrome.runtime.sendMessage({
        action: 'export-data',
        data: {
          format,
          include: {
            content: true,
            analysis: true,
            metadata: true
          },
          data: exportData
        }
      });

      if (response.success) {
        this.downloadFile(response.data, `page-analysis.${format}`, format);
        this.showSuccess('Data exported successfully');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Export error:', error);
      this.showError('Failed to export data');
    } finally {
      this.hideLoading();
    }
  }

  async generateTags() {
    if (!this.pageContent) {
      this.showError('No page content available');
      return;
    }

    this.showLoading('Generating tags...');

    try {
      // Simple tag generation based on keywords and title
      const titleWords = this.pageContent.title.toLowerCase().split(/\s+/);
      const contentWords = this.pageContent.text.toLowerCase().split(/\s+/).slice(0, 100);
      
      const allWords = [...titleWords, ...contentWords];
      const wordCount = {};
      
      allWords.forEach(word => {
        const cleanWord = word.replace(/[^\w]/g, '');
        if (cleanWord.length > 3) {
          wordCount[cleanWord] = (wordCount[cleanWord] || 0) + 1;
        }
      });

      const tags = Object.entries(wordCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 8)
        .map(([word]) => word);

      document.getElementById('tags-result').innerHTML = `
        <div class="tags-container">
          ${tags.map(tag => `<span class="tag">#${tag}</span>`).join('')}
        </div>
      `;
      
      this.showSuccess('Tags generated successfully');
    } catch (error) {
      console.error('Tag generation error:', error);
      this.showError('Failed to generate tags');
    } finally {
      this.hideLoading();
    }
  }

  // Utility methods
  formatText(text) {
    // Basic text formatting for display
    return text
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>');
  }

  async copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent || element.innerText;
    
    if (text) {
      await this.copyText(text);
    }
  }

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showSuccess('Copied to clipboard');
    } catch (error) {
      console.error('Copy error:', error);
      this.showError('Failed to copy to clipboard');
    }
  }

  downloadFile(content, filename, type) {
    const mimeTypes = {
      'json': 'application/json',
      'csv': 'text/csv',
      'txt': 'text/plain'
    };

    const blob = new Blob([content], { type: mimeTypes[type] || 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }

  async saveBookmark(type) {
    if (!this.pageContent) {
      this.showError('No page content to save');
      return;
    }

    try {
      const summary = document.getElementById('summary-text').textContent;
      
      const response = await chrome.runtime.sendMessage({
        action: 'save-bookmark',
        data: {
          url: this.pageContent.url,
          title: this.pageContent.title,
          content: summary || this.pageContent.text.substring(0, 500),
          tags: ['ai-summary', type],
          analysis: {
            wordCount: this.pageContent.wordCount,
            readingTime: this.pageContent.readingTime
          }
        }
      });

      if (response.success) {
        this.showSuccess('Bookmark saved successfully');
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error('Bookmark save error:', error);
      this.showError('Failed to save bookmark');
    }
  }

  async updateSettings(newSettings) {
    try {
      await chrome.runtime.sendMessage({
        action: 'update-settings',
        data: newSettings
      });
      
      this.settings = { ...this.settings, ...newSettings };
    } catch (error) {
      console.error('Settings update error:', error);
    }
  }

  // UI state management
  showLoading(text = 'Processing...') {
    this.isLoading = true;
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.add('active');
    this.updateStatus('processing', text);
  }

  hideLoading() {
    this.isLoading = false;
    document.getElementById('loading-overlay').classList.remove('active');
    this.updateStatus('ready', 'Ready');
  }

  updateStatus(type, text) {
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.getElementById('status-indicator');
    
    statusText.textContent = text;
    statusIndicator.className = `status-indicator ${type}`;
  }

  showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (toast.parentElement) {
        toast.remove();
      }
    }, 5000);
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});