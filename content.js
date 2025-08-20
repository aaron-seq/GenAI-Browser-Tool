// GenAI Browser Tool - Advanced Content Script
// Enhanced content extraction and page interaction capabilities

class ContentExtractor {
  constructor() {
    this.isInitialized = false;
    this.selectionHandler = null;
    this.mutationObserver = null;
    this.init();
  }

  init() {
    if (this.isInitialized) return;
    
    try {
      this.setupMessageHandlers();
      this.setupSelectionHandlers();
      this.setupMutationObserver();
      this.setupKeyboardShortcuts();
      this.createFloatingButton();
      
      this.isInitialized = true;
      console.log('GenAI Content Script initialized');
    } catch (error) {
      console.error('Error initializing content script:', error);
    }
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      const { action, data } = request;

      switch (action) {
        case 'extractContent':
          const content = this.extractPageContent();
          sendResponse({ success: true, data: content });
          break;

        case 'extractSelection':
          const selection = this.extractSelectedText();
          sendResponse({ success: true, data: selection });
          break;

        case 'highlightText':
          const highlighted = this.highlightText(data.text, data.className);
          sendResponse({ success: true, data: highlighted });
          break;

        case 'scrollToText':
          const scrolled = this.scrollToText(data.text);
          sendResponse({ success: true, data: scrolled });
          break;

        case 'injectSummary':
          const injected = await this.injectSummary(data.summary, data.position);
          sendResponse({ success: true, data: injected });
          break;

        case 'getPageMetadata':
          const metadata = this.getPageMetadata();
          sendResponse({ success: true, data: metadata });
          break;

        case 'analyzeReadability':
          const readability = this.analyzeReadability();
          sendResponse({ success: true, data: readability });
          break;

        case 'extractImages':
          const images = this.extractImages();
          sendResponse({ success: true, data: images });
          break;

        case 'extractLinks':
          const links = this.extractLinks();
          sendResponse({ success: true, data: links });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  extractPageContent() {
    try {
      const content = {
        title: this.getPageTitle(),
        url: window.location.href,
        domain: window.location.hostname,
        text: this.getMainText(),
        headings: this.extractHeadings(),
        paragraphs: this.extractParagraphs(),
        lists: this.extractLists(),
        tables: this.extractTables(),
        metadata: this.getPageMetadata(),
        readingTime: 0,
        wordCount: 0,
        language: this.detectLanguage(),
        timestamp: Date.now()
      };

      // Calculate reading metrics
      content.wordCount = this.countWords(content.text);
      content.readingTime = this.estimateReadingTime(content.wordCount);

      return content;
    } catch (error) {
      console.error('Error extracting page content:', error);
      return null;
    }
  }

  getPageTitle() {
    return document.title || 
           document.querySelector('h1')?.textContent?.trim() || 
           document.querySelector('[property="og:title"]')?.getAttribute('content') ||
           'Untitled Page';
  }

  getMainText() {
    // Try to find the main content area
    const contentSelectors = [
      'article',
      '[role="main"]',
      'main',
      '.content',
      '.post-content',
      '.entry-content',
      '.article-content',
      '#content',
      '.story-body'
    ];

    let mainElement = null;
    for (const selector of contentSelectors) {
      mainElement = document.querySelector(selector);
      if (mainElement) break;
    }

    // Fallback to body if no main content found
    if (!mainElement) {
      mainElement = document.body;
    }

    // Clean and extract text
    const clonedElement = mainElement.cloneNode(true);
    this.removeUnwantedElements(clonedElement);
    
    return clonedElement.innerText || clonedElement.textContent || '';
  }

  removeUnwantedElements(element) {
    // Remove scripts, styles, ads, navigation, etc.
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer',
      '.ad', '.ads', '.advertisement', '.sidebar',
      '.navigation', '.menu', '.comments', '.social',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'
    ];

    unwantedSelectors.forEach(selector => {
      const elements = element.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });
  }

  extractHeadings() {
    const headings = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    headingElements.forEach((heading, index) => {
      const text = heading.textContent?.trim();
      if (text) {
        headings.push({
          level: parseInt(heading.tagName[1]),
          text,
          id: heading.id || `heading-${index}`,
          element: heading
        });
      }
    });

    return headings;
  }

  extractParagraphs() {
    const paragraphs = [];
    const paragraphElements = document.querySelectorAll('p');
    
    paragraphElements.forEach((p, index) => {
      const text = p.textContent?.trim();
      if (text && text.length > 20) { // Filter out very short paragraphs
        paragraphs.push({
          text,
          wordCount: this.countWords(text),
          index,
          element: p
        });
      }
    });

    return paragraphs;
  }

  extractLists() {
    const lists = [];
    const listElements = document.querySelectorAll('ul, ol');
    
    listElements.forEach((list, index) => {
      const items = [];
      const listItems = list.querySelectorAll('li');
      
      listItems.forEach(li => {
        const text = li.textContent?.trim();
        if (text) {
          items.push(text);
        }
      });

      if (items.length > 0) {
        lists.push({
          type: list.tagName.toLowerCase(),
          items,
          index,
          element: list
        });
      }
    });

    return lists;
  }

  extractTables() {
    const tables = [];
    const tableElements = document.querySelectorAll('table');
    
    tableElements.forEach((table, index) => {
      const data = [];
      const rows = table.querySelectorAll('tr');
      
      rows.forEach(row => {
        const cells = [];
        const cellElements = row.querySelectorAll('td, th');
        
        cellElements.forEach(cell => {
          cells.push(cell.textContent?.trim() || '');
        });
        
        if (cells.length > 0) {
          data.push(cells);
        }
      });

      if (data.length > 0) {
        tables.push({
          data,
          index,
          element: table
        });
      }
    });

    return tables;
  }

  getPageMetadata() {
    const metadata = {};
    
    // Basic metadata
    metadata.title = document.title;
    metadata.url = window.location.href;
    metadata.domain = window.location.hostname;
    metadata.pathname = window.location.pathname;
    
    // Meta tags
    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach(meta => {
      const name = meta.getAttribute('name') || 
                   meta.getAttribute('property') || 
                   meta.getAttribute('http-equiv');
      const content = meta.getAttribute('content');
      
      if (name && content) {
        metadata[name] = content;
      }
    });

    // Link tags
    const linkTags = document.querySelectorAll('link[rel]');
    linkTags.forEach(link => {
      const rel = link.getAttribute('rel');
      const href = link.getAttribute('href');
      
      if (rel && href) {
        if (!metadata.links) metadata.links = {};
        metadata.links[rel] = href;
      }
    });

    // Structured data
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    const structuredData = [];
    jsonLdScripts.forEach(script => {
      try {
        const data = JSON.parse(script.textContent);
        structuredData.push(data);
      } catch (e) {
        // Ignore invalid JSON-LD
      }
    });
    
    if (structuredData.length > 0) {
      metadata.structuredData = structuredData;
    }

    return metadata;
  }

  extractSelectedText() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;

    const selectedText = selection.toString().trim();
    if (!selectedText) return null;

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    
    return {
      text: selectedText,
      wordCount: this.countWords(selectedText),
      context: this.getTextContext(container, selectedText),
      position: this.getSelectionPosition(range)
    };
  }

  getTextContext(container, selectedText) {
    try {
      const parentElement = container.nodeType === Node.TEXT_NODE ? 
                          container.parentElement : container;
      
      const fullText = parentElement.textContent || '';
      const startIndex = fullText.indexOf(selectedText);
      
      if (startIndex === -1) return selectedText;
      
      const contextStart = Math.max(0, startIndex - 100);
      const contextEnd = Math.min(fullText.length, startIndex + selectedText.length + 100);
      
      return fullText.substring(contextStart, contextEnd);
    } catch (error) {
      return selectedText;
    }
  }

  getSelectionPosition(range) {
    try {
      const rect = range.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
        height: rect.height
      };
    } catch (error) {
      return { top: 0, left: 0, width: 0, height: 0 };
    }
  }

  highlightText(text, className = 'genai-highlight') {
    try {
      // Create CSS for highlighting if it doesn't exist
      if (!document.querySelector('#genai-highlight-style')) {
        const style = document.createElement('style');
        style.id = 'genai-highlight-style';
        style.textContent = `
          .genai-highlight {
            background-color: #ffeb3b !important;
            color: #000 !important;
            padding: 1px 2px !important;
            border-radius: 2px !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Find and highlight text
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      const textNodes = [];
      let node;
      
      while (node = walker.nextNode()) {
        if (node.textContent.includes(text)) {
          textNodes.push(node);
        }
      }

      let highlightCount = 0;
      textNodes.forEach(textNode => {
        const parent = textNode.parentNode;
        const content = textNode.textContent;
        const index = content.indexOf(text);
        
        if (index !== -1) {
          const beforeText = content.substring(0, index);
          const highlightedText = content.substring(index, index + text.length);
          const afterText = content.substring(index + text.length);
          
          const span = document.createElement('span');
          span.className = className;
          span.textContent = highlightedText;
          
          const fragment = document.createDocumentFragment();
          if (beforeText) fragment.appendChild(document.createTextNode(beforeText));
          fragment.appendChild(span);
          if (afterText) fragment.appendChild(document.createTextNode(afterText));
          
          parent.replaceChild(fragment, textNode);
          highlightCount++;
        }
      });

      return highlightCount;
    } catch (error) {
      console.error('Error highlighting text:', error);
      return 0;
    }
  }

  scrollToText(text) {
    try {
      const elements = document.querySelectorAll('*');
      for (const element of elements) {
        if (element.textContent && element.textContent.includes(text)) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error scrolling to text:', error);
      return false;
    }
  }

  async injectSummary(summary, position = 'top') {
    try {
      // Remove any existing summary
      const existingSummary = document.querySelector('#genai-injected-summary');
      if (existingSummary) {
        existingSummary.remove();
      }

      // Create summary element
      const summaryElement = document.createElement('div');
      summaryElement.id = 'genai-injected-summary';
      summaryElement.innerHTML = `
        <div style="
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          padding: 16px;
          margin: 16px 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        ">
          <div style="
            display: flex;
            align-items: center;
            margin-bottom: 12px;
            font-weight: 600;
            color: #495057;
          ">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
            AI Summary
            <button onclick="this.closest('#genai-injected-summary').remove()" style="
              margin-left: auto;
              background: none;
              border: none;
              font-size: 18px;
              cursor: pointer;
              color: #6c757d;
            ">&times;</button>
          </div>
          <div style="color: #495057;">${summary}</div>
        </div>
      `;

      // Insert summary based on position
      if (position === 'top') {
        const mainContent = document.querySelector('article, main, .content, .post-content') || document.body;
        mainContent.insertBefore(summaryElement, mainContent.firstChild);
      } else {
        document.body.appendChild(summaryElement);
      }

      return true;
    } catch (error) {
      console.error('Error injecting summary:', error);
      return false;
    }
  }

  analyzeReadability() {
    const text = this.getMainText();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = this.countSyllables(text);

    // Calculate readability scores
    const avgWordsPerSentence = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;
    
    // Flesch Reading Ease Score
    const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
    
    // Flesch-Kincaid Grade Level
    const gradeLevel = (0.39 * avgWordsPerSentence) + (11.8 * avgSyllablesPerWord) - 15.59;

    return {
      sentences: sentences.length,
      words: words.length,
      syllables,
      avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
      avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 10) / 10,
      fleschScore: Math.round(fleschScore * 10) / 10,
      gradeLevel: Math.round(gradeLevel * 10) / 10,
      readingLevel: this.getReadingLevel(fleschScore)
    };
  }

  countSyllables(text) {
    // Simple syllable counting algorithm
    const words = text.toLowerCase().split(/\s+/);
    let syllableCount = 0;
    
    words.forEach(word => {
      word = word.replace(/[^a-z]/g, '');
      if (word.length === 0) return;
      
      // Count vowel groups
      let syllables = word.match(/[aeiouy]+/g);
      if (syllables) {
        syllableCount += syllables.length;
      }
      
      // Subtract silent e
      if (word.endsWith('e')) {
        syllableCount--;
      }
      
      // Every word has at least one syllable
      if (syllableCount === 0) {
        syllableCount = 1;
      }
    });
    
    return syllableCount;
  }

  getReadingLevel(fleschScore) {
    if (fleschScore >= 90) return 'Very Easy';
    if (fleschScore >= 80) return 'Easy';
    if (fleschScore >= 70) return 'Fairly Easy';
    if (fleschScore >= 60) return 'Standard';
    if (fleschScore >= 50) return 'Fairly Difficult';
    if (fleschScore >= 30) return 'Difficult';
    return 'Very Difficult';
  }

  extractImages() {
    const images = [];
    const imgElements = document.querySelectorAll('img');
    
    imgElements.forEach((img, index) => {
      const src = img.src;
      const alt = img.alt || '';
      const title = img.title || '';
      
      if (src && !src.startsWith('data:')) { // Exclude data URLs
        images.push({
          src,
          alt,
          title,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          index
        });
      }
    });

    return images;
  }

  extractLinks() {
    const links = [];
    const linkElements = document.querySelectorAll('a[href]');
    
    linkElements.forEach((link, index) => {
      const href = link.href;
      const text = link.textContent?.trim() || '';
      const title = link.title || '';
      
      if (href && !href.startsWith('javascript:')) {
        links.push({
          href,
          text,
          title,
          isExternal: link.hostname !== window.location.hostname,
          index
        });
      }
    });

    return links;
  }

  setupSelectionHandlers() {
    let selectionTimer;
    
    document.addEventListener('mouseup', () => {
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => {
        this.handleTextSelection();
      }, 300);
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || 
          e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => {
          this.handleTextSelection();
        }, 300);
      }
    });
  }

  handleTextSelection() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (selectedText && selectedText.length > 10) {
      this.showSelectionTooltip(selectedText);
    } else {
      this.hideSelectionTooltip();
    }
  }

  showSelectionTooltip(selectedText) {
    this.hideSelectionTooltip();
    
    const tooltip = document.createElement('div');
    tooltip.id = 'genai-selection-tooltip';
    tooltip.innerHTML = `
      <div style="
        position: fixed;
        background: #333;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        gap: 8px;
      ">
        <button onclick="this.parentElement.parentElement.remove();" style="
          background: #007bff;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        ">Summarize</button>
        <button onclick="this.parentElement.parentElement.remove();" style="
          background: #28a745;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        ">Translate</button>
        <button onclick="this.parentElement.parentElement.remove();" style="
          background: #dc3545;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 11px;
        ">Analyze</button>
      </div>
    `;

    // Position tooltip near selection
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      tooltip.style.left = `${rect.left + window.scrollX}px`;
      tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    }

    document.body.appendChild(tooltip);

    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.hideSelectionTooltip();
    }, 5000);
  }

  hideSelectionTooltip() {
    const tooltip = document.querySelector('#genai-selection-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
  }

  setupMutationObserver() {
    this.mutationObserver = new MutationObserver((mutations) => {
      let hasContentChanges = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          hasContentChanges = true;
        }
      });

      if (hasContentChanges) {
        // Debounce content change notifications
        clearTimeout(this.contentChangeTimer);
        this.contentChangeTimer = setTimeout(() => {
          this.notifyContentChange();
        }, 1000);
      }
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  notifyContentChange() {
    // Notify background script of content changes
    chrome.runtime.sendMessage({
      action: 'content-changed',
      data: {
        url: window.location.href,
        timestamp: Date.now()
      }
    }).catch(() => {
      // Ignore errors if background script is not available
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+S or Cmd+Shift+S - Summarize page
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        this.quickSummarize();
      }
      
      // Ctrl+Shift+Q or Cmd+Shift+Q - Quick question
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Q') {
        e.preventDefault();
        this.quickQuestion();
      }
    });
  }

  quickSummarize() {
    const content = this.extractPageContent();
    chrome.runtime.sendMessage({
      action: 'quick-summarize',
      data: content
    }).catch(() => {
      console.log('Could not send quick summarize message');
    });
  }

  quickQuestion() {
    const question = prompt('What would you like to know about this page?');
    if (question) {
      const content = this.extractPageContent();
      chrome.runtime.sendMessage({
        action: 'quick-question',
        data: { question, content }
      }).catch(() => {
        console.log('Could not send quick question message');
      });
    }
  }

  createFloatingButton() {
    // Create a floating AI assistant button
    const button = document.createElement('div');
    button.id = 'genai-floating-button';
    button.innerHTML = `
      <div style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999;
        transition: transform 0.2s;
      " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      </div>
    `;

    button.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'open-popup' }).catch(() => {
        console.log('Could not open popup');
      });
    });

    document.body.appendChild(button);
  }

  // Utility methods
  countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  estimateReadingTime(wordCount) {
    const wordsPerMinute = 200; // Average reading speed
    return Math.ceil(wordCount / wordsPerMinute);
  }

  detectLanguage() {
    // Simple language detection based on HTML lang attribute or content
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return htmlLang;

    // Fallback to simple text analysis
    const text = this.getMainText().substring(0, 1000);
    
    // Basic patterns for common languages
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af]/.test(text)) return 'ko';
    if (/[\u0400-\u04ff]/.test(text)) return 'ru';
    if (/[\u0600-\u06ff]/.test(text)) return 'ar';
    
    return 'en'; // Default to English
  }

  // Cleanup method
  destroy() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    
    // Remove floating button
    const floatingButton = document.querySelector('#genai-floating-button');
    if (floatingButton) {
      floatingButton.remove();
    }
    
    // Remove tooltips
    this.hideSelectionTooltip();
    
    // Remove injected styles
    const style = document.querySelector('#genai-highlight-style');
    if (style) {
      style.remove();
    }
  }
}

// Initialize content extractor when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentExtractor();
  });
} else {
  new ContentExtractor();
}

// Handle page navigation for SPAs
let currentUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    // Reinitialize for new page content
    setTimeout(() => {
      new ContentExtractor();
    }, 1000);
  }
});

urlObserver.observe(document.body, {
  childList: true,
  subtree: true
});