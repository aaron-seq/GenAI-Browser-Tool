/**
 * @file providers/openai-provider.js
 * @description Enhanced OpenAI provider with latest API features
 */

export class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.displayName = 'OpenAI GPT';
    this.baseURL = 'https://api.openai.com/v1';
    this.supportedModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
    this.defaultModel = 'gpt-4o-mini';
    this.rateLimiter = new RateLimiter(60, 60000); // 60 requests per minute
  }

  async isAvailable() {
    try {
      const apiKey = await this.getAPIKey();
      if (!apiKey) return false;
      
      // Test with a minimal request
      const response = await this.makeRequest('/models', { method: 'GET' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async generateSummary(content, options = {}) {
    await this.rateLimiter.waitForAvailability();
    
    const prompt = this.buildSummaryPrompt(content, options);
    const response = await this.makeCompletionRequest(prompt, {
      max_tokens: options.maxTokens || 300,
      temperature: 0.3,
      model: options.model || this.defaultModel
    });

    return {
      text: response.choices[0].message.content.trim(),
      confidence: this.calculateConfidence(response),
      usage: response.usage
    };
  }

  async answerQuestion(question, options = {}) {
    await this.rateLimiter.waitForAvailability();
    
    const messages = this.buildQuestionMessages(question, options);
    const response = await this.makeCompletionRequest(messages, {
      max_tokens: options.maxTokens || 500,
      temperature: 0.4,
      model: options.model || this.defaultModel
    });

    return {
      text: response.choices[0].message.content.trim(),
      confidence: this.calculateConfidence(response),
      usage: response.usage,
      sourceReferences: this.extractSourceReferences(response.choices[0].message.content)
    };
  }

  async translateText(text, options = {}) {
    await this.rateLimiter.waitForAvailability();
    
    const { targetLanguage = 'English', sourceLanguage = 'auto-detect' } = options;
    const prompt = `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Only return the translation:\n\n${text}`;
    
    const response = await this.makeCompletionRequest(prompt, {
      max_tokens: Math.max(text.length, 100),
      temperature: 0.2,
      model: options.model || this.defaultModel
    });

    return {
      text: response.choices[0].message.content.trim(),
      confidence: this.calculateConfidence(response),
      detectedLanguage: await this.detectLanguage(text),
      usage: response.usage
    };
  }

  async analyzeSentiment(text, options = {}) {
    await this.rateLimiter.waitForAvailability();
    
    const prompt = `Analyze the sentiment of the following text. Return a JSON object with "sentiment" (positive/negative/neutral), "confidence" (0-1), and "reasoning":\n\n${text}`;
    
    const response = await this.makeCompletionRequest(prompt, {
      max_tokens: 200,
      temperature: 0.1,
      model: options.model || this.defaultModel
    });

    try {
      const analysis = JSON.parse(response.choices[0].message.content.trim());
      return {
        sentiment: analysis.sentiment,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        usage: response.usage
      };
    } catch (error) {
      // Fallback parsing
      const content = response.choices[0].message.content.toLowerCase();
      const sentiment = content.includes('positive') ? 'positive' : 
                       content.includes('negative') ? 'negative' : 'neutral';
      return {
        sentiment,
        confidence: 0.8,
        reasoning: 'Automated fallback analysis',
        usage: response.usage
      };
    }
  }

  buildSummaryPrompt(content, options) {
    const { type = 'key-points', length = 'medium', customPrompt } = options;
    
    if (customPrompt) {
      return `${customPrompt}\n\nContent to summarize:\n${content}`;
    }

    const lengthMap = {
      'short': 'in 2-3 sentences',
      'medium': 'in 1-2 paragraphs',
      'long': 'in 3-4 paragraphs',
      'detailed': 'comprehensively with all key details'
    };

    const typeMap = {
      'key-points': 'Extract and list the key points',
      'tldr': 'Create a TL;DR summary',
      'executive': 'Write an executive summary',
      'technical': 'Provide a technical summary',
      'creative': 'Create an engaging summary'
    };

    return `${typeMap[type] || typeMap['key-points']} ${lengthMap[length] || lengthMap['medium']} of the following content:\n\n${content}`;
  }

  buildQuestionMessages(question, options) {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant. Answer questions accurately based on the provided context. If you\'re unsure, say so.'
      }
    ];

    if (options.context) {
      messages.push({
        role: 'system',
        content: `Context information:\n${options.context}`
      });
    }

    if (options.conversationHistory) {
      messages.push(...options.conversationHistory);
    }

    messages.push({
      role: 'user',
      content: question
    });

    return messages;
  }

  async makeCompletionRequest(promptOrMessages, options = {}) {
    const apiKey = await this.getAPIKey();
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const isMessagesFormat = Array.isArray(promptOrMessages);
    const requestBody = {
      model: options.model || this.defaultModel,
      max_tokens: options.max_tokens || 300,
      temperature: options.temperature || 0.3,
      ...(isMessagesFormat 
        ? { messages: promptOrMessages }
        : { 
            messages: [{ 
              role: 'user', 
              content: promptOrMessages 
            }]
          }
      )
    };

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    return await response.json();
  }

  async makeRequest(endpoint, options = {}) {
    const apiKey = await this.getAPIKey();
    return fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  }

  async getAPIKey() {
    const result = await chrome.storage.sync.get(['openai_api_key']);
    return result.openai_api_key;
  }

  calculateConfidence(response) {
    // Simple confidence calculation based on response characteristics
    const choice = response.choices[0];
    if (choice.finish_reason === 'stop') return 0.95;
    if (choice.finish_reason === 'length') return 0.8;
    return 0.7;
  }

  extractSourceReferences(content) {
    // Extract any reference markers from the content
    const references = [];
    const refPattern = /\[(\d+)\]|\(source:([^)]+)\)/gi;
    let match;
    
    while ((match = refPattern.exec(content)) !== null) {
      references.push(match[1] || match[2]);
    }
    
    return references;
  }

  async detectLanguage(text) {
    // Simple language detection (you could use a dedicated service)
    const commonPatterns = {
      'Spanish': /¿|ñ|á|é|í|ó|ú/,
      'French': /ç|à|è|é|ê|ë|î|ï|ô|ù|û|ü/,
      'German': /ä|ö|ü|ß/,
      'Russian': /[а-я]/i,
      'Chinese': /[\u4e00-\u9fff]/,
      'Japanese': /[\u3040-\u309f\u30a0-\u30ff]/,
      'Korean': /[\uac00-\ud7af]/
    };

    for (const [language, pattern] of Object.entries(commonPatterns)) {
      if (pattern.test(text)) return language;
    }

    return 'English';
  }
}

class RateLimiter {
  constructor(maxRequests, timeWindow) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }

  async waitForAvailability() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForAvailability();
    }

    this.requests.push(now);
  }
}
