import { describe, it, expect } from 'vitest';
import {
  renderMarkdown,
  escapeHtml,
  countWords,
  readabilityScore
} from '../../scripts/popup-main.js';

describe('popup rendering', () => {
  describe('renderMarkdown', () => {
    // Model output is derived from untrusted page text, so it is escaped before
    // any markup is added. These are the cases that must never round-trip HTML.
    it('escapes tags in model output before adding markup', () => {
      const html = renderMarkdown('<img src=x onerror=alert(1)>');

      expect(html).not.toContain('<img');
      expect(html).toContain('&lt;img');
    });

    it('escapes quotes so no attribute context can be forged', () => {
      expect(renderMarkdown('" onmouseover="alert(1)')).not.toContain('"');
    });

    it('escapes a script tag smuggled inside a bullet', () => {
      const html = renderMarkdown('- <script>alert(1)</script>');

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('still renders the small markdown subset the prompts ask for', () => {
      const html = renderMarkdown('- first\n- second');
      expect(html).toContain('<ul>');
      expect(html).toContain('<li>first</li>');
    });

    it('renders bold and inline code', () => {
      expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>');
      expect(renderMarkdown('`code`')).toContain('<code>code</code>');
    });

    it('returns an empty string for empty input', () => {
      expect(renderMarkdown('')).toBe('');
      expect(renderMarkdown(undefined)).toBe('');
    });
  });

  describe('escapeHtml', () => {
    it('escapes the four characters that matter', () => {
      expect(escapeHtml('<&>"')).toBe('&lt;&amp;&gt;&quot;');
    });

    it('escapes ampersands first so entities are not double-decoded', () => {
      expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });
  });

  describe('countWords', () => {
    it('counts whitespace-separated tokens', () => {
      expect(countWords('one two  three\nfour')).toBe(4);
    });

    it('returns zero for empty or missing text', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('   ')).toBe(0);
      expect(countWords(undefined)).toBe(0);
    });
  });

  describe('readabilityScore', () => {
    it('scores simple prose as easier than dense prose', () => {
      const simple = readabilityScore('The cat sat. The dog ran. It was fun.');
      const dense = readabilityScore(
        'Notwithstanding the aforementioned considerations, the epistemological ' +
        'ramifications of institutionalized bureaucratic superintendence remain ' +
        'fundamentally indeterminate.'
      );

      expect(simple.score).toBeGreaterThan(dense.score);
    });

    it('stays within the 0-100 range even on degenerate input', () => {
      for (const text of ['', 'a', 'x'.repeat(500)]) {
        const { score } = readabilityScore(text);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('labels the score', () => {
      expect(readabilityScore('The cat sat. The dog ran.').level).toEqual(expect.any(String));
    });
  });
});
