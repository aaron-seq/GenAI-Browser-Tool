/**
 * @file providers/ai-client.js
 * @description Single AI client for every supported cloud provider.
 *
 * One fetch call, shaped per provider. Replaces the previous five provider
 * classes (four of which returned hardcoded stub strings) and the health-check
 * orchestrator that load-balanced across them.
 *
 * Provider selection is the user's explicit choice from the options page — not
 * a scoring heuristic. A provider without a configured API key is unusable, and
 * saying so plainly beats silently falling back to something the user didn't pick.
 */

/**
 * @typedef {Object} ProviderSpec
 * @property {string} label      Human-readable name shown in the UI.
 * @property {string} defaultModel
 * @property {(model: string) => string} url
 * @property {(key: string) => Record<string, string>} headers
 * @property {(system: string, user: string, model: string, maxTokens: number) => any} body
 * @property {(data: any) => string} parse
 */

/** @type {Record<string, ProviderSpec>} */
export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude',
    defaultModel: 'claude-opus-5',
    url: () => 'https://api.anthropic.com/v1/messages',
    headers: key => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // Required for requests originating from a browser/extension context.
      'anthropic-dangerous-direct-browser-access': 'true'
    }),
    // No `temperature`: sampling parameters are rejected on current Claude models.
    body: (system, user, model, maxTokens) => ({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }]
    }),
    parse: data => {
      const block = (data.content || []).find(
        /** @param {any} b */ b => b.type === 'text'
      );
      if (!block) throw new Error('Anthropic response contained no text block');
      return block.text;
    }
  },

  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    url: () => 'https://api.openai.com/v1/chat/completions',
    headers: key => ({ Authorization: `Bearer ${key}` }),
    body: (system, user, model, maxTokens) => ({
      model,
      max_completion_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    }),
    parse: data => {
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('OpenAI response contained no message content');
      return text;
    }
  },

  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    url: model =>
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: key => ({ 'x-goog-api-key': key }),
    // Gemini takes the model in the URL path, not the body.
    body: (system, user, _model, maxTokens) => ({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    }),
    parse: data => {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini response contained no candidate text');
      return text;
    }
  }
};

/** Provider ids in the order they appear in the options page. */
export const PROVIDER_IDS = Object.keys(PROVIDERS);

/**
 * Error carrying a stable machine-readable code so the UI can distinguish
 * "you never configured a key" from "the provider rejected the request".
 */
export class AIError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'AIError';
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 60000;

export class AIClient {
  /**
   * @param {Object} options
   * @param {string} options.provider  Provider id, e.g. 'anthropic'.
   * @param {string} options.apiKey
   * @param {string} [options.model]   Overrides the provider default.
   * @param {number} [options.timeoutMs]
   */
  constructor({ provider, apiKey, model, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const spec = PROVIDERS[provider];
    if (!spec) {
      throw new AIError('UNKNOWN_PROVIDER', `Unknown AI provider: ${provider}`);
    }
    if (!apiKey) {
      throw new AIError(
        'MISSING_API_KEY',
        `No API key configured for ${spec.label}. Add one in the extension options page.`
      );
    }

    this.provider = provider;
    this.spec = spec;
    this.apiKey = apiKey;
    this.model = model || spec.defaultModel;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Send one completion request and return the model's text.
   *
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {number} [maxTokens]
   * @returns {Promise<string>}
   */
  async complete(systemPrompt, userPrompt, maxTokens = 1024) {
    const { spec } = this;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(spec.url(this.model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...spec.headers(this.apiKey) },
        body: JSON.stringify(spec.body(systemPrompt, userPrompt, this.model, maxTokens)),
        signal: controller.signal
      });
    } catch (error) {
      /** @type {any} */
      const err = error;
      if (err.name === 'AbortError') {
        throw new AIError('TIMEOUT', `${spec.label} did not respond within ${this.timeoutMs}ms`);
      }
      throw new AIError('NETWORK_ERROR', `Could not reach ${spec.label}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new AIError(
        response.status === 401 || response.status === 403 ? 'AUTH_ERROR' : 'PROVIDER_ERROR',
        // The provider's own message is the useful part; it never contains the key.
        `${spec.label} returned ${response.status}: ${await readErrorMessage(response)}`
      );
    }

    return spec.parse(await response.json()).trim();
  }
}

/**
 * Pull a human-readable message out of an error response without ever throwing
 * a second time — a malformed error body must not mask the original failure.
 *
 * @param {Response} response
 * @returns {Promise<string>}
 */
async function readErrorMessage(response) {
  try {
    const data = await response.json();
    return data.error?.message || data.message || response.statusText || 'unknown error';
  } catch {
    return response.statusText || 'unknown error';
  }
}
