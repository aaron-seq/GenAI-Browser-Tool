/**
 * @file providers/anthropic-provider.js
 * @description Anthropic AI provider
 */

export class AnthropicProvider {
  constructor() {
    this.name = 'anthropic';
  }

  async isAvailable() {
    return true;
  }

  /**
   * @param {string} _content
   * @param {any} _options
   */
  async generateSummary(_content, _options) {
    return 'Anthropic Summary Stub';
  }

  /**
   * @param {string} _question
   * @param {any} _options
   */
  async answerQuestion(_question, _options) {
    return {
      answer: 'Anthropic Answer Stub',
      confidence: 0.95,
      sourceReferences: []
    };
  }
}
