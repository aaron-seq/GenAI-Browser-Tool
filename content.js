/**
 * @file content.js
 * @description Content script: reads the page and hands text to the extension.
 *
 * This script only ever reads. It does not modify the page, inject styles, or
 * send anything anywhere — the background service worker is the only component
 * that talks to a network.
 */

/**
 * NOTE: this file must contain no `import` or `export` statements.
 *
 * A declarative MV3 content script is loaded as a *classic* script, where ESM
 * syntax is a parse error — the script silently fails to load and every
 * extraction returns "Receiving end does not exist". Chrome offers no
 * `"type": "module"` for `content_scripts`.
 *
 * A file with no ESM syntax is still importable by Vitest, so the test suite
 * imports this module for its side effects and picks the class off `globalThis`
 * (see the bottom of this file).
 */
class PageContentExtractor {
  constructor() {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      this.handleMessage(request)
        .then(data => sendResponse({ success: true, data }))
        .catch(/** @param {any} error */ error =>
          sendResponse({ success: false, error: error.message })
        );
      return true; // async sendResponse
    });
  }

  /**
   * @param {any} request
   * @returns {Promise<any>}
   */
  async handleMessage(request) {
    switch (request.action) {
      case 'extractContent':
        return this.extractPageContent();
      case 'extractSelection':
        return this.extractSelectedText();
      case 'getPageMetadata':
        return this.getPageMetadata();
      case 'extractLinks':
        return this.extractLinks();
      case 'extractImages':
        return this.extractImages();
      default:
        throw new Error(`Unknown action: ${request.action}`);
    }
  }

  extractPageContent() {
    return {
      title: this.getPageTitle(),
      url: window.location.href,
      domain: window.location.hostname,
      mainText: this.getMainText(),
      headings: this.extractHeadings(),
      metadata: this.getPageMetadata(),
      language: document.documentElement.lang || 'unknown',
      timestamp: Date.now()
    };
  }

  getPageTitle() {
    return document.title || document.querySelector('h1')?.textContent?.trim() || 'Untitled Page';
  }

  /**
   * Take the most specific container that looks like article content, then strip
   * chrome (nav, ads, comments) from a clone so the live page is never touched.
   *
   * @returns {string}
   */
  getMainText() {
    const selectors = [
      'article', '[role="main"]', 'main', '.post-content', '.entry-content',
      '#content', '.story-body', 'body'
    ];
    const mainElement = selectors
      .map(selector => document.querySelector(selector))
      .find(element => element);

    if (!mainElement) return '';

    const clone = /** @type {HTMLElement} */ (mainElement.cloneNode(true));
    const unwanted = [
      'script', 'style', 'noscript', 'nav', 'header', 'footer', 'aside',
      '.ad', '.sidebar', '.comments', '[role="navigation"]', '[role="banner"]'
    ];
    unwanted.forEach(selector => {
      clone.querySelectorAll(selector).forEach(element => element.remove());
    });

    // innerText (not textContent) so hidden elements stay out and block-level
    // structure survives as line breaks.
    return (clone.innerText || clone.textContent || '').trim();
  }

  extractHeadings() {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map(heading => ({
        level: Number(heading.tagName[1]),
        text: heading.textContent?.trim() || ''
      }))
      .filter(heading => heading.text);
  }

  getPageMetadata() {
    /** @type {Record<string, string>} */
    const metadata = {};
    document.querySelectorAll('meta').forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property');
      const content = meta.getAttribute('content');
      if (name && content) metadata[name] = content;
    });
    return metadata;
  }

  extractSelectedText() {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    return text ? { text } : null;
  }

  extractLinks() {
    return Array.from(document.querySelectorAll('a[href]'))
      .map(anchor => {
        const link = /** @type {HTMLAnchorElement} */ (anchor);
        return {
          href: link.href,
          text: link.textContent?.trim() || '',
          isExternal: link.hostname !== window.location.hostname
        };
      })
      .filter(link => link.href.startsWith('http'));
  }

  extractImages() {
    return Array.from(document.querySelectorAll('img'))
      .map(image => ({
        src: image.src,
        alt: image.alt,
        width: image.naturalWidth,
        height: image.naturalHeight
      }))
      .filter(image => image.src && !image.src.startsWith('data:'));
  }
}

// Exposed for the test suite, which cannot `import` from a classic script.
/** @type {any} */ (globalThis).PageContentExtractor = PageContentExtractor;

// Guarded so importing this file in a test does not register a listener against
// a mock `chrome` with no real message channel.
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  new PageContentExtractor();
}
