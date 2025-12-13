/**
 * @file services/content-extractor.js
 * @description Extracts content from web pages
 */

export class ContentExtractor {
  constructor() {}

  /**
   * @param {number} _tabId
   * @param {any} _payload
   */
  async extractPageContent(_tabId, _payload) {
    // Stub implementation
    return {
      title: 'Stub Title',
      content: 'Stub Content',
      url: 'https://example.com'
    };
  }
}
