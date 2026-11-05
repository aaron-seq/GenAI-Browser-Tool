/**
 * @file content.js
 * @description Content script: reads the page and hands text to the extension.
 *
 * This script only ever reads. It does not modify the page, inject styles, or
 * send anything anywhere — the background service worker is the only component
 * that talks to a network.
 */

class PageContentExtractor {
  constructor() {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      this.handleMessage(request)
        .then(data => sendResponse({ success: true, data }))
        .catch(
          /** @param {any} error */ error =>
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
      timestamp: Date.now(),
    };
  }

  getPageTitle() {
    return (
      document.title ||
      document.querySelector('h1')?.textContent?.trim() ||
      'Untitled Page'
    );
  }

  /**
   * Read the most specific article container without changing the live page.
   * A detached clone loses CSS visibility and innerText's block boundaries.
   *
   * @returns {string}
   */
  getMainText() {
    const selectors = [
      'article',
      '[role="main"]',
      'main',
      '.post-content',
      '.entry-content',
      '#content',
      '.story-body',
      'body',
    ];
    const mainElement = selectors
      .map(selector => document.querySelector(selector))
      .find(element => element);

    if (!mainElement) return '';

    const unwanted = [
      'script',
      'style',
      'noscript',
      'nav',
      'header',
      'footer',
      'aside',
      '.ad',
      '.sidebar',
      '.comments',
      '[role="navigation"]',
      '[role="banner"]',
    ].join(',');
    /** @type {Map<Element, CSSStyleDeclaration>} */
    const styles = new Map();
    /** @param {Element} element */
    const styleFor = element => {
      let style = styles.get(element);
      if (!style) {
        style = window.getComputedStyle(element);
        styles.set(element, style);
      }
      return style;
    };
    // A selected article can itself be inside a non-rendered container.
    for (
      let parent = mainElement.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const style = styleFor(parent);
      if (style.display === 'none' || style.contentVisibility === 'hidden')
        return '';
      if (parent.tagName === 'DETAILS' && !parent.hasAttribute('open')) {
        const summary = parent.querySelector(':scope > summary');
        if (!summary?.contains(mainElement)) return '';
      }
    }

    /** @type {string[]} */
    const parts = [];
    const lineBreak = (count = 1) => {
      const last = parts.at(-1);
      if (last?.endsWith('\n'.repeat(count))) return;
      if (last) parts[parts.length - 1] = last.trimEnd();
      parts.push('\n'.repeat(count));
    };
    /** @param {Element} element @returns {void} */
    const visit = element => {
      if (element.matches(unwanted)) return;
      const style = styleFor(element);
      if (style.display === 'none' || style.contentVisibility === 'hidden')
        return;

      const visible =
        style.visibility !== 'hidden' && style.visibility !== 'collapse';
      if (element.tagName === 'BR') {
        if (visible) lineBreak();
        return;
      }
      const block = /^(block|flow-root|list-item|flex|grid|table)/.test(
        style.display
      );
      // Blank lines retain the paragraph boundaries consumed by summary chunking.
      const breaks = element.tagName === 'P' ? 2 : 1;
      if (block) lineBreak(breaks);
      // Closed details render only their first direct summary, not the body.
      const collapsed =
        element.tagName === 'DETAILS' && !element.hasAttribute('open');
      const children = collapsed
        ? [element.querySelector(':scope > summary')]
        : element.childNodes;
      for (const child of children) {
        if (!child) continue;
        if (child.nodeType === Node.ELEMENT_NODE) {
          // visibility can be explicitly restored by a child of a hidden parent.
          visit(/** @type {Element} */ (child));
        } else if (child.nodeType === Node.TEXT_NODE && visible) {
          let text = child.textContent || '';
          if (!/^(pre|break-spaces)/.test(style.whiteSpace)) {
            text = text.replace(/\s+/g, ' ');
            if (/[\s]$/.test(parts.at(-1) || '')) text = text.trimStart();
          }
          if (text) parts.push(text);
        }
      }
      if (block) lineBreak(breaks);
    };
    visit(mainElement);
    return parts.join('').trim();
  }

  extractHeadings() {
    return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map(heading => ({
        level: Number(heading.tagName[1]),
        text: heading.textContent?.trim() || '',
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
          isExternal: link.hostname !== window.location.hostname,
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
        height: image.naturalHeight,
      }))
      .filter(image => image.src && !image.src.startsWith('data:'));
  }
}

new PageContentExtractor();
