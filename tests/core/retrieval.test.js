import { describe, expect, it } from 'vitest';
import { DocumentIndex } from '../../core/retrieval.js';
import { documentKey, MAX_DOCUMENT_CHARS } from '../../core/document.js';

describe('document identity', () => {
  it('isolates different URLs and changed content at the same URL', async () => {
    const first = await documentKey('https://example.test/a', 'First edition');
    expect(await documentKey('https://example.test/a', 'First edition')).toBe(
      first
    );
    expect(
      await documentKey('https://example.test/b', 'First edition')
    ).not.toBe(first);
    expect(
      await documentKey('https://example.test/a', 'Second edition')
    ).not.toBe(first);
  });

  it('rejects empty or oversized documents before indexing', async () => {
    expect(() => new DocumentIndex('  ')).toThrow(/No readable/);
    await expect(
      documentKey('x', 'x'.repeat(MAX_DOCUMENT_CHARS + 1))
    ).rejects.toThrow(/2,000,000/);
  });
});

describe('local document retrieval', () => {
  const book = `${'General introductory background. '.repeat(3000)}\nThe heliotrope experiment produced 73 amber crystals.\n${'Unrelated appendix. '.repeat(500)}`;

  it('retrieves evidence beyond the old 24,000-character boundary', () => {
    const result = new DocumentIndex(book).retrieve(
      'How many amber crystals did the heliotrope experiment produce?'
    );
    expect(result.context).toContain('73 amber crystals');
    expect(result.sources.some(source => source.start > 24000)).toBe(true);
    expect(
      result.sources.some(source =>
        source.excerpt.includes('73 amber crystals')
      )
    ).toBe(true);
    expect(result.context.length).toBeLessThan(24000);
    expect(result.sources.length).toBeLessThanOrEqual(6);
    expect(result.retrieval.mode).toBe('matched');
  });

  it('returns exact source text and stable character offsets', () => {
    for (const source of new DocumentIndex(book).retrieve('heliotrope')
      .sources) {
      expect(source.text).toBe(book.slice(source.start, source.end));
      expect(source.id).toMatch(/^S\d+$/);
    }
  });

  it('samples beginning, middle and end for an overview with no lexical matches', () => {
    const result = new DocumentIndex(book).retrieve('summarize');
    expect(result.retrieval.mode).toBe('overview');
    expect(result.sources[0].start).toBe(0);
    expect(result.sources.at(-1).end).toBe(book.length);
  });

  it('uses earlier question wording for short follow-ups', () => {
    const result = new DocumentIndex(book).retrieve(
      'Why?',
      'Explain the heliotrope experiment'
    );
    expect(result.context).toContain('73 amber crystals');
    expect(result.retrieval.mode).toBe('matched');
  });

  it('handles a short page and an unbroken word without hanging', () => {
    expect(
      new DocumentIndex('A short page.').retrieve('topic').sources
    ).toHaveLength(1);
    const longWord = 'x'.repeat(MAX_DOCUMENT_CHARS);
    const result = new DocumentIndex(longWord).retrieve('missing');
    expect(result.sources.at(-1).end).toBe(longWord.length);
    expect(result.context.length).toBeLessThan(24000);
  });
});
