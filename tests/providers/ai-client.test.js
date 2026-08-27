import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AIClient,
  AIError,
  PROVIDERS,
  backoffDelay,
  parseRetryAfter
} from '../../providers/ai-client.js';

/**
 * @param {any} body
 * @param {{ ok?: boolean, status?: number, statusText?: string }} [init]
 */
function mockResponse(body, init = {}) {
  return {
    ok: init.ok !== false,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: { get: () => init.retryAfter ?? null },
    json: vi.fn().mockResolvedValue(body)
  };
}

/** A client that retries without making the test wait for real backoff. */
function fastClient(overrides = {}) {
  return new AIClient({ provider: 'anthropic', apiKey: 'k', ...overrides });
}

const ANTHROPIC_OK = { content: [{ type: 'text', text: '  a summary  ' }] };
const OPENAI_OK = { choices: [{ message: { content: 'a summary' } }] };
const GEMINI_OK = { candidates: [{ content: { parts: [{ text: 'a summary' }] } }] };

describe('AIClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('construction', () => {
    it('rejects an unknown provider', () => {
      expect(() => new AIClient({ provider: 'nope', apiKey: 'k' }))
        .toThrow(/Unknown AI provider/);
    });

    it('reports a missing API key with a code the UI can branch on', () => {
      try {
        new AIClient({ provider: 'anthropic', apiKey: '' });
        throw new Error('expected constructor to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(AIError);
        expect(error.code).toBe('MISSING_API_KEY');
        expect(error.message).toMatch(/options page/i);
      }
    });

    it('falls back to the provider default model', () => {
      const client = new AIClient({ provider: 'anthropic', apiKey: 'k' });
      expect(client.model).toBe(PROVIDERS.anthropic.defaultModel);
    });

    it('honours an explicit model override', () => {
      const client = new AIClient({ provider: 'openai', apiKey: 'k', model: 'gpt-5' });
      expect(client.model).toBe('gpt-5');
    });
  });

  describe('request shaping', () => {
    it('sends Anthropic the messages API shape with auth headers', async () => {
      global.fetch.mockResolvedValue(mockResponse(ANTHROPIC_OK));
      const client = new AIClient({ provider: 'anthropic', apiKey: 'sk-ant-test' });

      const text = await client.complete('system prompt', 'user prompt', 500);

      expect(text).toBe('a summary');
      const [url, init] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(init.headers['x-api-key']).toBe('sk-ant-test');
      expect(init.headers['anthropic-version']).toBe('2023-06-01');

      const body = JSON.parse(init.body);
      expect(body.system).toBe('system prompt');
      expect(body.messages).toEqual([{ role: 'user', content: 'user prompt' }]);
      expect(body.max_tokens).toBe(500);
      // Sampling parameters are rejected by current Claude models.
      expect(body).not.toHaveProperty('temperature');
    });

    it('sends OpenAI a system + user message pair with a bearer token', async () => {
      global.fetch.mockResolvedValue(mockResponse(OPENAI_OK));
      const client = new AIClient({ provider: 'openai', apiKey: 'sk-test' });

      await client.complete('system prompt', 'user prompt');

      const [url, init] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(init.headers.Authorization).toBe('Bearer sk-test');
      expect(JSON.parse(init.body).messages).toEqual([
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'user prompt' }
      ]);
    });

    it('puts the Gemini model in the path and the key in a header, not the query', async () => {
      global.fetch.mockResolvedValue(mockResponse(GEMINI_OK));
      const client = new AIClient({ provider: 'gemini', apiKey: 'AIza-test', model: 'gemini-x' });

      await client.complete('system prompt', 'user prompt');

      const [url, init] = global.fetch.mock.calls[0];
      expect(url).toContain('/models/gemini-x:generateContent');
      // A key in the URL leaks into logs and history; it belongs in a header.
      expect(url).not.toContain('AIza-test');
      expect(init.headers['x-goog-api-key']).toBe('AIza-test');
      expect(JSON.parse(init.body).system_instruction.parts[0].text).toBe('system prompt');
    });
  });

  describe('retrying transient failures', () => {
    // Chunked summarization turns one request into up to nine. Without retries a
    // single transient 429 discards every section that already succeeded.
    it('retries a 429 and returns the eventual success', async () => {
      global.fetch
        .mockResolvedValueOnce(mockResponse({ error: { message: 'slow down' } }, { ok: false, status: 429 }))
        .mockResolvedValueOnce(mockResponse(ANTHROPIC_OK));

      const text = await fastClient().complete('s', 'u');

      expect(text).toBe('a summary');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('retries a 529 overloaded response', async () => {
      global.fetch
        .mockResolvedValueOnce(mockResponse({}, { ok: false, status: 529 }))
        .mockResolvedValueOnce(mockResponse(ANTHROPIC_OK));

      await expect(fastClient().complete('s', 'u')).resolves.toBe('a summary');
    });

    it('retries a network blip', async () => {
      global.fetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(mockResponse(ANTHROPIC_OK));

      await expect(fastClient().complete('s', 'u')).resolves.toBe('a summary');
    });

    it('gives up after maxRetries and reports the last error', async () => {
      global.fetch.mockResolvedValue(
        mockResponse({ error: { message: 'slow down' } }, { ok: false, status: 429 })
      );

      await expect(fastClient({ maxRetries: 2 }).complete('s', 'u')).rejects.toMatchObject({
        code: 'PROVIDER_ERROR'
      });
      // The initial attempt plus two retries.
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('can be configured to not retry at all', async () => {
      global.fetch.mockResolvedValue(mockResponse({}, { ok: false, status: 503 }));

      await expect(fastClient({ maxRetries: 0 }).complete('s', 'u')).rejects.toThrow();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry a bad API key — that wastes quota and hides the real error', async () => {
      global.fetch.mockResolvedValue(
        mockResponse({ error: { message: 'invalid x-api-key' } }, { ok: false, status: 401 })
      );

      await expect(fastClient().complete('s', 'u')).rejects.toMatchObject({ code: 'AUTH_ERROR' });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry a malformed request', async () => {
      global.fetch.mockResolvedValue(mockResponse({}, { ok: false, status: 400 }));

      await expect(fastClient().complete('s', 'u')).rejects.toThrow();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry a timeout, which may still be running provider side', async () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      global.fetch.mockRejectedValue(abort);

      await expect(fastClient({ timeoutMs: 10 }).complete('s', 'u')).rejects.toMatchObject({
        code: 'TIMEOUT'
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('sends an identical body on every attempt', async () => {
      global.fetch
        .mockResolvedValueOnce(mockResponse({}, { ok: false, status: 429 }))
        .mockResolvedValueOnce(mockResponse(ANTHROPIC_OK));

      await fastClient().complete('system', 'user', 400);

      const [first, second] = global.fetch.mock.calls.map(call => call[1].body);
      expect(first).toBe(second);
    });
  });

  describe('backoff', () => {
    it('grows exponentially and stays bounded', () => {
      const first = backoffDelay(0);
      const later = backoffDelay(3);

      expect(later).toBeGreaterThan(first);
      expect(backoffDelay(50)).toBeLessThanOrEqual(8000 + 500);
    });

    it('adds jitter so parallel sections do not resynchronise', () => {
      const samples = new Set(Array.from({ length: 20 }, () => backoffDelay(1)));
      expect(samples.size).toBeGreaterThan(1);
    });

    it("prefers the provider's Retry-After over our guess", () => {
      expect(backoffDelay(0, 2000)).toBe(2000);
    });

    it('caps even a hostile Retry-After', () => {
      expect(backoffDelay(0, 999999)).toBeLessThanOrEqual(8000);
    });
  });

  describe('parseRetryAfter', () => {
    it('reads a seconds value', () => {
      expect(parseRetryAfter('3')).toBe(3000);
    });

    it('reads an HTTP date', () => {
      const soon = new Date(Date.now() + 5000).toUTCString();
      expect(parseRetryAfter(soon)).toBeGreaterThan(1000);
    });

    it('returns undefined when absent or unparseable', () => {
      expect(parseRetryAfter(null)).toBeUndefined();
      expect(parseRetryAfter('')).toBeUndefined();
      expect(parseRetryAfter('next tuesday')).toBeUndefined();
    });

    it('never returns a negative delay for a past date', () => {
      expect(parseRetryAfter(new Date(Date.now() - 60000).toUTCString())).toBe(0);
    });
  });

  describe('failure modes', () => {
    it('classifies 401 as an auth error', async () => {
      global.fetch.mockResolvedValue(
        mockResponse({ error: { message: 'invalid x-api-key' } }, { ok: false, status: 401 })
      );
      const client = new AIClient({ provider: 'anthropic', apiKey: 'bad' });

      await expect(client.complete('s', 'u')).rejects.toMatchObject({ code: 'AUTH_ERROR' });
    });

    // These assert classification, not retry policy, so retries are off to keep
    // them fast and to isolate what they cover.
    it('classifies other non-2xx responses as provider errors and keeps the message', async () => {
      global.fetch.mockResolvedValue(
        mockResponse({ error: { message: 'rate limited' } }, { ok: false, status: 429 })
      );
      const client = new AIClient({ provider: 'openai', apiKey: 'k', maxRetries: 0 });

      await expect(client.complete('s', 'u')).rejects.toMatchObject({
        code: 'PROVIDER_ERROR',
        message: expect.stringContaining('rate limited')
      });
    });

    it('never puts the API key in the error message', async () => {
      global.fetch.mockResolvedValue(
        mockResponse({ error: { message: 'nope' } }, { ok: false, status: 403 })
      );
      const client = new AIClient({ provider: 'openai', apiKey: 'sk-super-secret' });

      await expect(client.complete('s', 'u')).rejects.toSatisfy(
        /** @param {Error} err */ err => !err.message.includes('sk-super-secret')
      );
    });

    it('survives an error body that is not JSON', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: { get: () => null },
        json: vi.fn().mockRejectedValue(new SyntaxError('not json'))
      });
      const client = new AIClient({ provider: 'anthropic', apiKey: 'k', maxRetries: 0 });

      await expect(client.complete('s', 'u')).rejects.toMatchObject({
        message: expect.stringContaining('Internal Server Error')
      });
    });

    it('reports a network failure without masking the cause', async () => {
      global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const client = new AIClient({ provider: 'anthropic', apiKey: 'k', maxRetries: 0 });

      await expect(client.complete('s', 'u')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: expect.stringContaining('Failed to fetch')
      });
    });

    it('reports an abort as a timeout', async () => {
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      global.fetch.mockRejectedValue(abort);
      const client = new AIClient({ provider: 'anthropic', apiKey: 'k', timeoutMs: 10 });

      await expect(client.complete('s', 'u')).rejects.toMatchObject({ code: 'TIMEOUT' });
    });

    it('throws rather than returning empty text when a provider returns no content', async () => {
      global.fetch.mockResolvedValue(mockResponse({ content: [] }));
      const client = new AIClient({ provider: 'anthropic', apiKey: 'k' });

      await expect(client.complete('s', 'u')).rejects.toThrow(/no text block/);
    });
  });
});
