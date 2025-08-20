// GenAI Browser Tool - AI Providers
// Integration with multiple AI providers (Chrome built-in, OpenAI, Anthropic, Gemini)

export class AIProviders {
  constructor() {
    this.providers = {
      'chrome-ai': new ChromeAIProvider(),
      'openai': new OpenAIProvider(),
      'anthropic': new AnthropicProvider(),
      'gemini': new GeminiProvider()
    };
  }

  // Generic summarization method
  async summarize(text, options = {}) {
    const { provider = 'chrome-ai', apiKey, type = 'key-points', length = 'medium', format = 'markdown' } = options;
    
    const aiProvider = this.providers[provider];
    if (!aiProvider) {
      throw new Error(`Provider ${provider} not supported`);
    }

    return await aiProvider.summarize(text, { apiKey, type, length, format });
  }

  // Generic question answering
  async askQuestion(question, options = {}) {
    const { provider = 'chrome-ai', apiKey, context = '', conversationHistory = [], model = 'auto' } = options;
    
    const aiProvider = this.providers[provider];
    if (!aiProvider) {
      throw new Error(`Provider ${provider} not supported`);
    }

    return await aiProvider.askQuestion(question, { apiKey, context, conversationHistory, model });
  }

  // Generic translation
  async translate(text, options = {}) {
    const { provider = 'chrome-ai', apiKey, targetLanguage = 'en', sourceLanguage = 'auto' } = options;
    
    const aiProvider = this.providers[provider];
    if (!aiProvider) {
      throw new Error(`Provider ${provider} not supported`);
    }

    return await aiProvider.translate(text, { apiKey, targetLanguage, sourceLanguage });
  }

  // Generic sentiment analysis
  async analyzeSentiment(text, options = {}) {
    const { provider = 'chrome-ai', apiKey } = options;
    
    const aiProvider = this.providers[provider];
    if (!aiProvider) {
      throw new Error(`Provider ${provider} not supported`);
    }

    return await aiProvider.analyzeSentiment(text, { apiKey });
  }

  // Check provider availability
  async checkProviderAvailability(provider) {
    const aiProvider = this.providers[provider];
    if (!aiProvider) return false;
    
    return await aiProvider.isAvailable();
  }

  // Get supported providers
  getSupportedProviders() {
    return Object.keys(this.providers);
  }
}

// Chrome Built-in AI Provider
class ChromeAIProvider {
  constructor() {
    this.name = 'chrome-ai';
    this.displayName = 'Chrome Built-in AI';
  }

  async isAvailable() {
    try {
      return 'ai' in chrome && (
        'summarizer' in chrome.ai || 
        'languageModel' in chrome.ai ||
        'translator' in chrome.ai
      );
    } catch (error) {
      return false;
    }
  }

  async summarize(text, options = {}) {
    const { type = 'key-points', length = 'medium', format = 'markdown' } = options;
    
    try {
      if (!('ai' in chrome) || !('summarizer' in chrome.ai)) {
        throw new Error('Chrome Summarizer API not available');
      }

      const availability = await chrome.ai.summarizer.availability();
      if (availability === 'unavailable') {
        throw new Error('Chrome Summarizer API is unavailable');
      }

      const summarizer = await chrome.ai.summarizer.create({
        type,
        format,
        length
      });

      const summary = await summarizer.summarize(text);
      summarizer.destroy();

      return summary;
    } catch (error) {
      console.error('Chrome AI summarization error:', error);
      throw error;
    }
  }

  async askQuestion(question, options = {}) {
    const { context = '', conversationHistory = [] } = options;
    
    try {
      if (!('ai' in chrome) || !('languageModel' in chrome.ai)) {
        throw new Error('Chrome Language Model API not available');
      }

      const availability = await chrome.ai.languageModel.availability();
      if (availability === 'unavailable') {
        throw new Error('Chrome Language Model API is unavailable');
      }

      const session = await chrome.ai.languageModel.create({
        systemPrompt: `You are a helpful AI assistant. Context: ${context}`
      });

      // Add conversation history
      for (const msg of conversationHistory) {
        if (msg.role === 'user') {
          await session.prompt(msg.content);
        }
      }

      const answer = await session.prompt(question);
      session.destroy();

      return answer;
    } catch (error) {
      console.error('Chrome AI question answering error:', error);
      throw error;
    }
  }

  async translate(text, options = {}) {
    const { targetLanguage = 'en', sourceLanguage = 'auto' } = options;
    
    try {
      if (!('ai' in chrome) || !('translator' in chrome.ai)) {
        throw new Error('Chrome Translator API not available');
      }

      const availability = await chrome.ai.translator.availability();
      if (availability === 'unavailable') {
        throw new Error('Chrome Translator API is unavailable');
      }

      const translator = await chrome.ai.translator.create({
        sourceLanguage,
        targetLanguage
      });

      const translation = await translator.translate(text);
      translator.destroy();

      return translation;
    } catch (error) {
      console.error('Chrome AI translation error:', error);
      throw error;
    }
  }

  async analyzeSentiment(text, options = {}) {
    try {
      // Use language model for sentiment analysis if available
      if (!('ai' in chrome) || !('languageModel' in chrome.ai)) {
        throw new Error('Chrome Language Model API not available');
      }

      const session = await chrome.ai.languageModel.create({
        systemPrompt: 'Analyze the sentiment of the given text and respond with only a JSON object containing "label" (positive/negative/neutral) and "confidence" (0-100).'
      });

      const response = await session.prompt(text);
      session.destroy();

      try {
        const result = JSON.parse(response);
        return {
          label: result.label || 'neutral',
          confidence: result.confidence || 50,
          raw: response
        };
      } catch (parseError) {
        // Fallback if JSON parsing fails
        return {
          label: 'neutral',
          confidence: 50,
          raw: response
        };
      }
    } catch (error) {
      console.error('Chrome AI sentiment analysis error:', error);
      throw error;
    }
  }
}

// OpenAI Provider
class OpenAIProvider {
  constructor() {
    this.name = 'openai';
    this.displayName = 'OpenAI';
    this.apiBase = 'https://api.openai.com/v1';
  }

  async isAvailable() {
    return true; // Always available if API key is provided
  }

  async summarize(text, options = {}) {
    const { apiKey, type = 'key-points', length = 'medium' } = options;
    
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const lengthMap = {
      'short': '1-2 sentences',
      'medium': '3-5 sentences',
      'long': '1-2 paragraphs'
    };

    const typeMap = {
      'key-points': 'key points in bullet format',
      'tldr': 'a brief TL;DR summary',
      'teaser': 'an engaging teaser that highlights the most interesting parts',
      'headline': 'a single headline that captures the main point'
    };

    const prompt = `Please provide ${typeMap[type]} of the following text in ${lengthMap[length]}:\n\n${text}`;

    try {
      const response = await fetch(`${this.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful assistant that provides concise and accurate summaries.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('OpenAI summarization error:', error);
      throw error;
    }
  }

  async askQuestion(question, options = {}) {
    const { apiKey, context = '', conversationHistory = [], model = 'gpt-3.5-turbo' } = options;
    
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const messages = [
      { role: 'system', content: `You are a helpful AI assistant. ${context ? `Context: ${context}` : ''}` }
    ];

    // Add conversation history
    conversationHistory.forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });

    messages.push({ role: 'user', content: question });

    try {
      const response = await fetch(`${this.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 1000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('OpenAI question answering error:', error);
      throw error;
    }
  }

  async translate(text, options = {}) {
    const { apiKey, targetLanguage = 'English' } = options;
    
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const prompt = `Translate the following text to ${targetLanguage}:\n\n${text}`;

    try {
      const response = await fetch(`${this.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a professional translator. Provide only the translation without additional comments.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1000,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('OpenAI translation error:', error);
      throw error;
    }
  }

  async analyzeSentiment(text, options = {}) {
    const { apiKey } = options;
    
    if (!apiKey) {
      throw new Error('OpenAI API key is required');
    }

    const prompt = `Analyze the sentiment of this text and respond with only a JSON object containing "label" (positive/negative/neutral) and "confidence" (0-100):\n\n${text}`;

    try {
      const response = await fetch(`${this.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a sentiment analysis expert. Respond only with valid JSON.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 100,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content.trim());
      
      return {
        label: result.label || 'neutral',
        confidence: result.confidence || 50,
        raw: data.choices[0].message.content
      };
    } catch (error) {
      console.error('OpenAI sentiment analysis error:', error);
      throw error;
    }
  }
}

// Anthropic (Claude) Provider
class AnthropicProvider {
  constructor() {
    this.name = 'anthropic';
    this.displayName = 'Anthropic Claude';
    this.apiBase = 'https://api.anthropic.com/v1';
  }

  async isAvailable() {
    return true; // Always available if API key is provided
  }

  async summarize(text, options = {}) {
    const { apiKey, type = 'key-points', length = 'medium' } = options;
    
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const lengthMap = {
      'short': '1-2 sentences',
      'medium': '3-5 sentences',
      'long': '1-2 paragraphs'
    };

    const typeMap = {
      'key-points': 'key points in bullet format',
      'tldr': 'a brief TL;DR summary',
      'teaser': 'an engaging teaser that highlights the most interesting parts',
      'headline': 'a single headline that captures the main point'
    };

    const prompt = `Please provide ${typeMap[type]} of the following text in ${lengthMap[length]}:\n\n${text}`;

    try {
      const response = await fetch(`${this.apiBase}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 500,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      return data.content[0].text.trim();
    } catch (error) {
      console.error('Anthropic summarization error:', error);
      throw error;
    }
  }

  async askQuestion(question, options = {}) {
    const { apiKey, context = '', conversationHistory = [] } = options;
    
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const messages = [];
    
    // Add conversation history
    conversationHistory.forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });

    const prompt = context ? `Context: ${context}\n\nQuestion: ${question}` : question;
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await fetch(`${this.apiBase}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1000,
          messages
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      return data.content[0].text.trim();
    } catch (error) {
      console.error('Anthropic question answering error:', error);
      throw error;
    }
  }

  async translate(text, options = {}) {
    const { apiKey, targetLanguage = 'English' } = options;
    
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const prompt = `Translate the following text to ${targetLanguage}. Provide only the translation:\n\n${text}`;

    try {
      const response = await fetch(`${this.apiBase}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1000,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      return data.content[0].text.trim();
    } catch (error) {
      console.error('Anthropic translation error:', error);
      throw error;
    }
  }

  async analyzeSentiment(text, options = {}) {
    const { apiKey } = options;
    
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }

    const prompt = `Analyze the sentiment of this text and respond with only a JSON object containing "label" (positive/negative/neutral) and "confidence" (0-100):\n\n${text}`;

    try {
      const response = await fetch(`${this.apiBase}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
          messages: [
            { role: 'user', content: prompt }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json();
      const result = JSON.parse(data.content[0].text.trim());
      
      return {
        label: result.label || 'neutral',
        confidence: result.confidence || 50,
        raw: data.content[0].text
      };
    } catch (error) {
      console.error('Anthropic sentiment analysis error:', error);
      throw error;
    }
  }
}

// Google Gemini Provider
class GeminiProvider {
  constructor() {
    this.name = 'gemini';
    this.displayName = 'Google Gemini';
    this.apiBase = 'https://generativelanguage.googleapis.com/v1beta';
  }

  async isAvailable() {
    return true; // Always available if API key is provided
  }

  async summarize(text, options = {}) {
    const { apiKey, type = 'key-points', length = 'medium' } = options;
    
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }

    const lengthMap = {
      'short': '1-2 sentences',
      'medium': '3-5 sentences',
      'long': '1-2 paragraphs'
    };

    const typeMap = {
      'key-points': 'key points in bullet format',
      'tldr': 'a brief TL;DR summary',
      'teaser': 'an engaging teaser that highlights the most interesting parts',
      'headline': 'a single headline that captures the main point'
    };

    const prompt = `Please provide ${typeMap[type]} of the following text in ${lengthMap[length]}:\n\n${text}`;

    try {
      const response = await fetch(`${this.apiBase}/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.3
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error('Gemini summarization error:', error);
      throw error;
    }
  }

  async askQuestion(question, options = {}) {
    const { apiKey, context = '', conversationHistory = [] } = options;
    
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }

    let prompt = context ? `Context: ${context}\n\n` : '';
    
    // Add conversation history
    if (conversationHistory.length > 0) {
      prompt += 'Conversation History:\n';
      conversationHistory.forEach(msg => {
        prompt += `${msg.role}: ${msg.content}\n`;
      });
      prompt += '\n';
    }
    
    prompt += `Question: ${question}`;

    try {
      const response = await fetch(`${this.apiBase}/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error('Gemini question answering error:', error);
      throw error;
    }
  }

  async translate(text, options = {}) {
    const { apiKey, targetLanguage = 'English' } = options;
    
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }

    const prompt = `Translate the following text to ${targetLanguage}. Provide only the translation:\n\n${text}`;

    try {
      const response = await fetch(`${this.apiBase}/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.3
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error('Gemini translation error:', error);
      throw error;
    }
  }

  async analyzeSentiment(text, options = {}) {
    const { apiKey } = options;
    
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }

    const prompt = `Analyze the sentiment of this text and respond with only a JSON object containing "label" (positive/negative/neutral) and "confidence" (0-100):\n\n${text}`;

    try {
      const response = await fetch(`${this.apiBase}/models/gemini-pro:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const result = JSON.parse(data.candidates[0].content.parts[0].text.trim());
      
      return {
        label: result.label || 'neutral',
        confidence: result.confidence || 50,
        raw: data.candidates[0].content.parts[0].text
      };
    } catch (error) {
      console.error('Gemini sentiment analysis error:', error);
      throw error;
    }
  }
}