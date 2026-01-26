/**
 * @file providers/base-provider.js
 * @description Abstract base class defining the AI provider interface contract.
 * All provider implementations must extend this class and implement required methods.
 */

export class BaseAIProvider {
  constructor(name, displayName) {
    if (this.constructor === BaseAIProvider) {
      throw new Error('Cannot instantiate abstract BaseAIProvider directly');
    }
    if (!name || !displayName) {
      throw new Error('Provider must have name and displayName');
    }
    this.name = name;
    this.displayName = displayName;
  }

  /**
   * Check if provider is available and configured
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error(`Method isAvailable must be implemented by ${this.name}`);
  }

  /**
   * Generate summary of content
   * @param {string} content - Content to summarize
   * @param {Object} options - Summary options (type, length, etc.)
   * @returns {Promise<string|Object>} Summary text or structured object
   */
  async generateSummary(content, options) {
    throw new Error(`Method generateSummary must be implemented by ${this.name}`);
  }

  /**
   * Answer a question based on context
   * @param {string} question - Question to answer
   * @param {Object} options - Question options (context, maxTokens, etc.)
   * @returns {Promise<Object>} Answer object with text, confidence, sources
   */
  async answerQuestion(question, options) {
    throw new Error(`Method answerQuestion must be implemented by ${this.name}`);
  }

  /**
   * Translate text to target language
   * @param {string} text - Text to translate
   * @param {Object} options - Translation options (targetLanguage, sourceLanguage)
   * @returns {Promise<Object>} Translation result with text, detectedLanguage, confidence
   */
  async translateText(text, options) {
    throw new Error(`Method translateText must be implemented by ${this.name}`);
  }

  /**
   * Analyze sentiment of text
   * @param {string} text - Text to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Sentiment result with sentiment, confidence, reasoning
   */
  async analyzeSentiment(text, options) {
    throw new Error(`Method analyzeSentiment must be implemented by ${this.name}`);
  }

  /**
   * Extract keywords from text (optional, has default implementation)
   * @param {string} text - Text to extract keywords from
   * @param {Object} options - Extraction options
   * @returns {Promise<string[]>} Array of keywords
   */
  async extractKeywords(text, options = {}) {
    // Default implementation using generateSummary
    const summary = await this.generateSummary(text, {
      type: 'key-points',
      length: 'short',
      ...options
    });
    return this.parseKeywordsFromSummary(summary);
  }

  /**
   * Generate tags for content (optional, has default implementation)
   * @param {string} content - Content to generate tags for
   * @param {Object} options - Tag generation options
   * @returns {Promise<string[]>} Array of tags
   */
  async generateTags(content, options = {}) {
    // Default implementation using question answering
    const result = await this.answerQuestion(
      'Generate 5-10 relevant tags or keywords for this content. Return only the tags, comma-separated.',
      { context: content, ...options }
    );
    
    const tagsText = result.answer?.text || result.answer || '';
    return tagsText
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0 && tag.length < 30)
      .slice(0, 10);
  }

  /**
   * Parse keywords from summary text
   * @param {string|Object} summary - Summary to parse
   * @returns {string[]} Array of keywords
   * @private
   */
  parseKeywordsFromSummary(summary) {
    const text = typeof summary === 'string' ? summary : summary.text || '';
    
    // Basic keyword extraction: find capitalized words and important terms
    const words = text.split(/\s+/);
    const keywords = new Set();
    
    for (const word of words) {
      const cleaned = word.replace(/[^a-zA-Z0-9]/g, '');
      // Extract capitalized words or words longer than 5 chars
      if (cleaned.length > 5 || (cleaned.length > 0 && cleaned[0] === cleaned[0].toUpperCase())) {
        keywords.add(cleaned.toLowerCase());
      }
    }
    
    return Array.from(keywords).slice(0, 10);
  }

  /**
   * Get provider capabilities
   * @returns {Object} Capabilities object
   */
  getCapabilities() {
    return {
      summarization: this.canSummarize(),
      questionAnswering: this.canAnswerQuestions(),
      translation: this.canTranslate(),
      sentimentAnalysis: this.canAnalyzeSentiment(),
      keywordExtraction: this.canExtractKeywords(),
      tagGeneration: this.canGenerateTags()
    };
  }

  // Capability check methods
  canSummarize() {
    return this.generateSummary !== BaseAIProvider.prototype.generateSummary;
  }

  canAnswerQuestions() {
    return this.answerQuestion !== BaseAIProvider.prototype.answerQuestion;
  }

  canTranslate() {
    return this.translateText !== BaseAIProvider.prototype.translateText;
  }

  canAnalyzeSentiment() {
    return this.analyzeSentiment !== BaseAIProvider.prototype.analyzeSentiment;
  }

  canExtractKeywords() {
    return this.extractKeywords !== BaseAIProvider.prototype.extractKeywords;
  }

  canGenerateTags() {
    return this.generateTags !== BaseAIProvider.prototype.generateTags;
  }
}
