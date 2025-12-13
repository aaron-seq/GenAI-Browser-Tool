/**
 * @file providers/chrome-ai-provider.js
 * @description Chrome built-in AI provider
 */

export class ChromeAIProvider {
  constructor() {
    this.name = 'chrome-ai';
  }

  async isAvailable() {
    return true; // Stubbed to true for tests
  }

  /**
   * @param {string} _content
   * @param {any} _options
   */
  async generateSummary(_content, _options) {
    return 'Chrome AI Summary Stub';
  }

  /**
   * @param {string} _question
   * @param {any} _options
   */
  async answerQuestion(_question, _options) {
    return {
      answer: 'Chrome AI Answer Stub',
      confidence: 0.9,
      sourceReferences: []
    };
  }
}
