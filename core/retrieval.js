import { validateDocument } from './document.js';

const PASSAGE_CHARS = 2800;
const OVERLAP = 200;
const MAX_PASSAGES = 6;
const STOP_WORDS = new Set(
  'a an and are as at be by can did do does for from how i in is it me of on or that the this to was were what when where which who why with you your'.split(
    ' '
  )
);

/** @param {string} text @returns {string[]} */
function terms(text) {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(
    word => word.length > 1 && !STOP_WORDS.has(word)
  );
}

/** Local BM25 retrieval. The index stays in the service worker's memory. */
export class DocumentIndex {
  /** @param {string} text */
  constructor(text) {
    validateDocument(text);
    this.totalChars = text.length;
    /** @type {{id: string, start: number, end: number, text: string, length: number, counts: Map<string, number>}[]} */
    this.passages = [];
    /** @type {Map<string, number>} */
    this.frequencies = new Map();
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + PASSAGE_CHARS, text.length);
      if (end < text.length) {
        // Bound the search to this passage. Scanning the whole prefix for every
        // boundary makes long unbroken text quadratic in document length.
        const boundary = start + text.slice(start, end + 1).lastIndexOf(' ');
        if (boundary > start + PASSAGE_CHARS / 2) end = boundary;
      }
      const passage = text.slice(start, end);
      const words = terms(passage);
      /** @type {Map<string, number>} */
      const counts = new Map();
      for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
      for (const word of counts.keys())
        this.frequencies.set(word, (this.frequencies.get(word) || 0) + 1);
      this.passages.push({
        id: `S${this.passages.length + 1}`,
        start,
        end,
        text: passage,
        length: words.length,
        counts,
      });
      if (end === text.length) break;
      start = end - OVERLAP;
    }
    this.averageLength =
      this.passages.reduce((sum, p) => sum + p.length, 0) /
        this.passages.length || 1;
  }

  /**
   * Recent user wording helps resolve terse follow-ups without another model call.
   * @param {string} question
   * @param {string} [previousQuestion]
   */
  retrieve(question, previousQuestion = '') {
    const currentTerms = terms(question);
    const query = [
      ...new Set([
        ...currentTerms,
        ...(currentTerms.length < 4 ? terms(previousQuestion) : []),
      ]),
    ].slice(0, 40);
    const count = this.passages.length;
    const ranked = this.passages
      .map(passage => {
        let score = 0;
        for (const term of query) {
          const tf = passage.counts.get(term) || 0;
          if (!tf) continue;
          const df = this.frequencies.get(term) || 0;
          const idf = Math.log(1 + (count - df + 0.5) / (df + 0.5));
          score +=
            (idf * tf * 2.2) /
            (tf + 1.2 * (0.25 + (0.75 * passage.length) / this.averageLength));
        }
        return { passage, score };
      })
      .sort((a, b) => b.score - a.score || a.passage.start - b.passage.start);

    const matched = ranked
      .filter(item => item.score > 0)
      .slice(0, MAX_PASSAGES);
    // An overview samples the document rather than silently taking only its opening.
    const sampleCount = Math.min(count, MAX_PASSAGES);
    const selected = matched.length
      ? matched.map(item => item.passage)
      : Array.from(
          { length: sampleCount },
          (_, i) =>
            this.passages[
              Math.round((i * (count - 1)) / Math.max(1, sampleCount - 1))
            ]
        );
    const focusTerms = [...query].sort(
      (a, b) =>
        (this.frequencies.get(a) || Infinity) -
        (this.frequencies.get(b) || Infinity)
    );
    const sources = selected
      .filter(p => p !== undefined)
      .sort((a, b) => a.start - b.start)
      .map(({ id, start, end, text }) => {
        const lower = text.toLowerCase();
        const match =
          focusTerms
            .map(term => lower.indexOf(term))
            .find(position => position >= 0) ?? 0;
        const excerptStart = Math.max(0, match - 120);
        return {
          id,
          start,
          end,
          text,
          excerpt: text.slice(excerptStart, excerptStart + 520),
        };
      });
    return {
      context: sources
        .map(
          source =>
            `[${source.id}] Characters ${source.start + 1}–${source.end}\n${source.text}`
        )
        .join('\n\n'),
      sources,
      retrieval: {
        mode: matched.length ? 'matched' : 'overview',
        selected: sources.length,
        total: count,
        totalChars: this.totalChars,
      },
    };
  }
}
