/**
 * @file content-scripts/content-main.js
 * @description Content script for GenAI Browser Assistant
 */

class ContentScriptManager {
  constructor() {
    this.initialize();
  }

  initialize() {
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open
    });

    console.log('GenAI Content Script: Initialized on', window.location.href);
  }

  handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'extractContent':
          const content = this.extractPageContent();
          sendResponse({ success: true, data: content });
          break;
          
        case 'getSelectedText':
          const selectedText = window.getSelection().toString().trim();
          sendResponse({ success: true, data: selectedText });
          break;
          
        case 'highlightText':
          this.highlightText(message.text);
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Content script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  extractPageContent() {
    const title = document.title;
    const url = window.location.href;
    
    // Remove scripts and styles
    const contentElements = document.body.cloneNode(true);
    const scripts = contentElements.querySelectorAll('script, style, nav, header, footer, .ads, .advertisement');
    scripts.forEach(el => el.remove());
    
    // Get main text content
    const mainText = contentElements.innerText || contentElements.textContent || '';
    
    // Calculate basic stats
    const wordCount = mainText.trim().split(/\s+/).filter(word => word.length > 0).length;
    const readingTime = Math.ceil(wordCount / 200); // 200 words per minute
    
    // Extract headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map(h => ({ level: h.tagName, text: h.innerText.trim() }))
      .filter(h => h.text.length > 0);
    
    // Extract links
    const links = Array.from(document.querySelectorAll('a[href]'))
      .map(a => ({ url: a.href, text: a.innerText.trim() }))
      .filter(l => l.text.length > 0)
      .slice(0, 20); // Limit to first 20 links
    
    return {
      title,
      url,
      mainText: mainText.trim(),
      wordCount,
      readingTime,
      headings,
      links,
      extractedAt: Date.now()
    };
  }

  highlightText(text) {
    if (!text || text.length < 3) return;
    
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    
    const textNodes = [];
    let node;
    
    while (node = walker.nextNode()) {
      if (node.nodeValue.includes(text)) {
        textNodes.push(node);
      }
    }
    
    textNodes.forEach(textNode => {
      const parent = textNode.parentNode;
      const content = textNode.nodeValue;
      const index = content.indexOf(text);
      
      if (index >= 0) {
        const before = content.substring(0, index);
        const match = content.substring(index, index + text.length);
        const after = content.substring(index + text.length);
        
        const highlight = document.createElement('mark');
        highlight.style.backgroundColor = '#ffeb3b';
        highlight.style.color = '#000';
        highlight.textContent = match;
        
        const fragment = document.createDocumentFragment();
        if (before) fragment.appendChild(document.createTextNode(before));
        fragment.appendChild(highlight);
        if (after) fragment.appendChild(document.createTextNode(after));
        
        parent.replaceChild(fragment, textNode);
      }
    });
  }
}

// Initialize content script
new ContentScriptManager();