import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { DocumentIndex } from '../../core/retrieval.js';

const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const fixtures = [50_000, 500_000, 2_000_000].map(size => {
  const evidence =
    'The heliotrope experiment produced exactly 73 amber crystals.';
  const opening = 'Background on reading and learning. '
    .repeat(Math.ceil(size / 36))
    .slice(0, size - evidence.length);
  return opening + evidence;
});

const results = fixtures.map(text => {
  const indexing = [];
  const queries = [];
  let recall = 0;
  let passages = 0;
  for (let run = 0; run < 5; run++) {
    const start = performance.now();
    const index = new DocumentIndex(text);
    indexing.push(performance.now() - start);
    passages = index.passages.length;
    for (let query = 0; query < 10; query++) {
      const queryStart = performance.now();
      const result = index.retrieve(
        'How many amber crystals did the heliotrope experiment produce?'
      );
      queries.push(performance.now() - queryStart);
      assert.ok(result.context.length <= 24000);
      if (result.context.includes('exactly 73 amber crystals')) recall++;
    }
  }
  return {
    characters: text.length,
    passages,
    indexing_ms: {
      p50: percentile(indexing, 0.5),
      p95: percentile(indexing, 0.95),
    },
    retrieval_ms: {
      p50: percentile(queries, 0.5),
      p95: percentile(queries, 0.95),
    },
    exact_evidence_hits: recall,
    queries: queries.length,
    opening_excerpt_contains_answer: text
      .slice(0, 24000)
      .includes('73 amber crystals'),
  };
});

process.stdout.write(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      cpu: cpus()[0]?.model,
      fixture:
        'synthetic repeated background with exact late-document evidence',
      limitations:
        'Local CPU retrieval only; no provider/network latency, paraphrase quality, PDF/OCR, or real-book evaluation. Not a production latency guarantee.',
      results,
    },
    null,
    2
  ) + '\n'
);
