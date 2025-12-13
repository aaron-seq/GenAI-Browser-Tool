/**
 * @file providers/gemini-provider.js
 * @description Google Gemini AI provider
 */

export class GeminiProvider {
  constructor() {
    this.name = 'gemini';
  }

  async isAvailable() {
    return true;
  }

  /**
   * @param {string} _content
   * @param {any} _options
   */
  async generateSummary(_content, _options) {
    return 'Gemini Summary Stub';
  }

  /**
   * @param {string} _question
   * @param {any} _options
   */
  async answerQuestion(_question, _options) {
    return {
      answer: 'Gemini Answer Stub',
      confidence: 0.92,
      sourceReferences: []
    };
  }
}
