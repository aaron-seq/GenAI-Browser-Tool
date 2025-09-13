// GenAI Browser Tool - AI Service
// Manages integrations with multiple AI providers (e.g., Chrome's built-in AI, OpenAI).

// --- Base Provider Class ---
/**
 * @class BaseAIProvider
 * An abstract base class for AI providers, defining the common interface.
 */
class BaseAIProvider {
  constructor(name) {
    this.name = name;
  }
  async isAvailable() { throw new Error("isAvailable() must be implemented by subclasses"); }
  async summarize(text, options) { throw new Error("summarize() must be implemented by subclasses"); }
  async askQuestion(question, options) { throw new Error("askQuestion() must be implemented by subclasses"); }
  async translate(text, options) { throw new Error("translate() must be implemented by subclasses"); }
  async analyzeSentiment(text, options) { throw new Error("analyzeSentiment() must be implemented by subclasses"); }
}


// --- Chrome AI Provider ---
/**
 * @class ChromeAIProvider
 * Interacts with the browser's built-in AI (e.g., Gemini Nano).
 */
class ChromeAIProvider extends BaseAIProvider {
    constructor() {
        super('chrome-ai');
    }

    async isAvailable() {
        try {
            return (await chrome.ai.canCreateTextSession()) === 'readily';
        } catch (e) {
            return false;
        }
    }

    async summarize(text, options) {
        const session = await chrome.ai.createTextSession();
        const prompt = `Summarize the following text as ${options.type || 'key points'} with a ${options.length || 'medium'} length in ${options.format || 'markdown'} format:\n\n${text}`;
        const result = await session.prompt(prompt);
        session.destroy();
        return result;
    }
    
    async askQuestion(question, options) {
        const session = await chrome.ai.createTextSession();
        const prompt = `Context: ${options.context}\n\nConversation History: ${JSON.stringify(options.conversationHistory)}\n\nQuestion: ${question}\n\nAnswer:`;
        const result = await session.prompt(prompt);
        session.destroy();
        return result;
    }
    // Implement other methods (translate, analyzeSentiment) similarly...
}


// --- OpenAI Provider ---
/**
 * @class OpenAIProvider
 * Interacts with the OpenAI API.
 */
class OpenAIProvider extends BaseAIProvider {
    constructor() {
        super('openai');
    }
    
    async isAvailable() {
        // Availability depends on having a valid API key. This can be checked in settings.
        return true; 
    }

    async summarize(text, options) {
        if (!options.apiKey) throw new Error("OpenAI API key is required.");
        // Logic to call OpenAI API for summarization
        return `[Summary from OpenAI for: ${text.substring(0, 50)}...]`;
    }
    // Implement other methods...
}

// ... (You can add AnthropicProvider, GeminiProvider similarly) ...


// --- Main AI Service ---
/**
 * @class AIService
 * Manages interactions with various AI providers for summarization, Q&A, and more.
 */
export class AIService {
  constructor() {
    this.providers = {
      'chrome-ai': new ChromeAIProvider(),
      'openai': new OpenAIProvider(),
      // 'anthropic': new AnthropicProvider(),
      // 'gemini': new GeminiProvider()
    };
  }

  async getSummary(text, options = {}) {
    const provider = this.providers[options.provider || 'chrome-ai'];
    if (!provider) throw new Error(`Provider ${options.provider} not supported`);
    return provider.summarize(text, options);
  }

  async getAnswer(question, options = {}) {
    const provider = this.providers[options.provider || 'chrome-ai'];
    if (!provider) throw new Error(`Provider ${options.provider} not supported`);
    return provider.askQuestion(question, options);
  }

  async checkProviderAvailability(providerName) {
    const provider = this.providers[providerName];
    return provider ? provider.isAvailable() : false;
  }
}

