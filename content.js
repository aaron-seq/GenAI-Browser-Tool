/**
 * @file content.js
 * @description Content script for GenAI Browser Tool. Extracts page content and interacts with the DOM.
 */

class PageContentExtractor {
    constructor() {
        this.initialize();
    }

    initialize() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        this.setupMessageListener();
        // eslint-disable-next-line no-console
        console.log('GenAI Content Script: Initialized.');
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request)
                .then(response => sendResponse({
                    success: true,
                    data: response
                }))
                .catch(error => sendResponse({
                    success: false,
                    error: error.message
                }));
            return true; // Keep message channel open for async response.
        });
    }

    async handleMessage(request) {
        const {
            action,
            data
        } = request;
        switch (action) {
            case 'extractContent':
                return this.extractPageContent();
            case 'extractSelection':
                return this.extractSelectedText();
            case 'highlightText':
                return this.highlightText(data.text, data.className);
            case 'scrollToText':
                return this.scrollToText(data.text);
            case 'getPageMetadata':
                return this.getPageMetadata();
            case 'extractImages':
                return this.extractImages();
            case 'extractLinks':
                return this.extractLinks();
            default:
                throw new Error(`Unknown action: ${action}`);
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
            language: document.documentElement.lang || 'en',
            timestamp: Date.now(),
        };
    }

    getPageTitle() {
        return document.title || document.querySelector('h1')?.textContent?.trim() || 'Untitled Page';
    }

    getMainText() {
        const selectors = [
            'article', '[role="main"]', 'main', '.post-content', '.entry-content',
            '#content', '.story-body', 'body'
        ];
        const mainElement = selectors.map(s => document.querySelector(s)).find(el => el);

        if (!mainElement) return '';

        const clonedElement = mainElement.cloneNode(true);
        this.removeUnwantedElements(clonedElement);
        return clonedElement.innerText?.trim() || '';
    }

    removeUnwantedElements(element) {
        const unwantedSelectors = [
            'script', 'style', 'nav', 'header', 'footer', '.ad', '.sidebar',
            '.comments', '[role="navigation"]', '[role="banner"]'
        ];
        unwantedSelectors.forEach(selector => {
            element.querySelectorAll(selector).forEach(el => el.remove());
        });
    }

    extractHeadings() {
        return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .map(h => ({
                level: parseInt(h.tagName[1]),
                text: h.textContent?.trim(),
            }))
            .filter(h => h.text);
    }

    getPageMetadata() {
        const metadata = {};
        document.querySelectorAll('meta').forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            if (name) metadata[name] = meta.getAttribute('content');
        });
        return metadata;
    }

    extractSelectedText() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;

        const text = selection.toString().trim();
        if (!text) return null;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        return {
            text,
            position: {
                top: rect.top + window.scrollY,
                left: rect.left + window.scrollX,
            },
        };
    }

    highlightText(text, _className = 'genai-highlight') {
        // Implement highlighting logic if needed. For now, we focus on extraction.
        return {
            highlighted: true
        };
    }

    scrollToText(text) {
        const element = Array.from(document.querySelectorAll('*'))
            .find(el => el.textContent?.includes(text));
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            return true;
        }
        return false;
    }

    extractImages() {
        return Array.from(document.querySelectorAll('img'))
            .map(img => ({
                src: img.src,
                alt: img.alt,
                width: img.naturalWidth,
                height: img.naturalHeight,
            }))
            .filter(img => img.src && !img.src.startsWith('data:'));
    }

    extractLinks() {
        return Array.from(document.querySelectorAll('a[href]'))
            .map(a => ({
                href: a.href,
                text: a.textContent?.trim(),
                isExternal: a.hostname !== window.location.hostname,
            }))
            .filter(link => link.href && !link.href.startsWith('javascript:'));
    }
}

// Ensure the script runs once the DOM is ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new PageContentExtractor());
} else {
    new PageContentExtractor();
}
