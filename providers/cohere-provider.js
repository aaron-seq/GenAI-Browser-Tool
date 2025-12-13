/**
 * @file providers/cohere-provider.js
 * @description Cohere AI provider
 */

export class CohereProvider {
  constructor() {
    this.name = 'cohere';
  }

  async isAvailable() {
    return true;
  }

  /**
   * @param {string} _content
   * @param {any} _options
   */
  async generateSummary(_content, _options) {
    return 'Cohere Summary Stub';
  }

  /**
   * @param {string} _question
   * @param {any} _options
   */
  async answerQuestion(_question, _options) {
    return {
      answer: 'Cohere Answer Stub',
      confidence: 0.88,
      sourceReferences: []
    };
  }
}
