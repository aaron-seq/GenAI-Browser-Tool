import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

/**
 * `content.js` is a classic content script: it exports nothing and registers a
 * `chrome.runtime.onMessage` listener when it loads. Tests drive it the same way
 * Chrome does — import once for the side effect, capture the listener, and send
 * it messages — which is also how `tests/integration` drives `background.js`.
 *
 * These test text traversal and CSS filtering, not layout. The real-Chromium
 * extraction regression verifies visibility, block boundaries, and a stable DOM.
 */

/** @type {(request: any, sender: any, sendResponse: (r: any) => void) => boolean} */
let listener;

/**
 * @param {any} request
 * @returns {Promise<any>}
 */
function send(request) {
  return new Promise(resolve => {
    listener(request, {}, resolve);
  });
}

beforeAll(async () => {
  await import('../../content.js');
  listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
});

beforeEach(() => {
  document.body.innerHTML = '';
  // Clearing the head removes the <title> element, so set the title after.
  document.head.innerHTML = '';
  document.title = 'Test Page';
  document.documentElement.lang = 'en';
});

describe('extractContent', () => {
  it('returns the page title, url, and main text', async () => {
    document.body.innerHTML =
      '<article><p>The body of the article.</p></article>';

    const { success, data } = await send({ action: 'extractContent' });

    expect(success).toBe(true);
    expect(data.title).toBe('Test Page');
    expect(data.url).toBe(window.location.href);
    expect(data.domain).toBe(window.location.hostname);
    expect(data.mainText).toContain('The body of the article.');
    expect(data.language).toBe('en');
  });

  // The selector list is ordered most-specific-first so a page with both an
  // <article> and a <body> full of navigation yields the article.
  it('prefers an article over the whole body', async () => {
    document.body.innerHTML = `
      <div>site-wide chrome that should not win</div>
      <article><p>real content</p></article>`;

    const { data } = await send({ action: 'extractContent' });

    expect(data.mainText).toContain('real content');
    expect(data.mainText).not.toContain('site-wide chrome');
  });

  it('falls back to body when no content container is marked up', async () => {
    document.body.innerHTML = '<p>bare paragraph</p>';

    const { data } = await send({ action: 'extractContent' });

    expect(data.mainText).toContain('bare paragraph');
  });

  it('separates adjacent blocks while preserving inline words and whitespace', async () => {
    document.body.innerHTML =
      '<article><p>First <strong>visible</strong> paragraph.</p><p>Second paragraph.</p><p>Co<em>operate</em> with <span> inline </span> text.</p></article>';

    const { data } = await send({ action: 'extractContent' });

    expect(data.mainText).toBe(
      'First visible paragraph.\n\nSecond paragraph.\n\nCooperate with inline text.'
    );
  });

  it('omits non-rendered descendants and respects CSS block and inline display', async () => {
    document.head.innerHTML =
      '<style>.hidden{display:none}.block{display:block}.inline{display:inline}</style>';
    document.body.innerHTML =
      '<article><span class="block">First block.</span><span class="hidden">Hidden text.</span><span class="block">Second block.</span><p class="inline">Inline</p> text.</article>';

    const { data } = await send({ action: 'extractContent' });

    expect(data.mainText).toBe('First block.\nSecond block.\nInline text.');
  });

  it.each([
    '<div style="display:none"><article>Hidden article.</article></div>',
    '<article style="display:none">Hidden article.</article>',
    '<article><section style="content-visibility:hidden">Hidden content.</section></article>',
  ])('omits content in a non-rendered container: %s', async markup => {
    document.body.innerHTML = markup;

    const { data } = await send({ action: 'extractContent' });

    expect(data.mainText).toBe('');
  });

  it('allows a descendant to restore visibility without including hidden siblings', async () => {
    document.body.innerHTML =
      '<article><div style="visibility:hidden">Hidden <span style="visibility:visible">Visible child.</span><span>Hidden sibling.</span></div><div style="visibility:collapse">Collapsed text.</div></article>';

    const { data } = await send({ action: 'extractContent' });

    expect(data.mainText).toBe('Visible child.');
  });

  it('keeps explicit line breaks and preformatted internal spacing', async () => {
    document.body.innerHTML =
      '<article><p>First line.<br>Second line.</p><pre>one  two\n  three</pre></article>';

    const { data } = await send({ action: 'extractContent' });

    expect(data.mainText).toBe(
      'First line.\nSecond line.\n\none  two\n  three'
    );
  });

  it.each([
    {
      label: 'closed, open, and nested details',
      markup:
        '<article><details><summary>Closed summary.</summary><p>Hidden closed body.</p><summary>Hidden second summary.</summary><details open><summary>Hidden nested summary.</summary><p>Hidden nested body.</p></details></details><details open><summary>Open summary.</summary><p>Open body.</p><details><summary>Nested closed summary.</summary><p>Hidden nested closed body.</p></details></details></article>',
      expected:
        'Closed summary.\nOpen summary.\n\nOpen body.\n\nNested closed summary.',
    },
    {
      label: 'a selected article inside a closed details body',
      markup:
        '<details><summary>Visible summary.</summary><article>Hidden selected article.</article></details>',
      expected: '',
    },
    {
      label: 'a selected article inside the first summary',
      markup:
        '<details><summary><article>Visible selected article.</article></summary><p>Hidden body.</p></details>',
      expected: 'Visible selected article.',
    },
    {
      label: 'a selected article inside a later summary',
      markup:
        '<details><summary>First summary.</summary><summary><article>Hidden selected article.</article></summary></details>',
      expected: '',
    },
    {
      label:
        'a selected article inside nested open details under a closed ancestor',
      markup:
        '<details><summary>Outer summary.</summary><details open><summary>Inner summary.</summary><article>Hidden selected article.</article></details></details>',
      expected: '',
    },
    {
      label: 'closed details with no summary',
      markup:
        '<article><details>Hidden text.<p>Hidden body.</p></details></article>',
      expected: '',
    },
  ])('respects $label', async ({ markup, expected }) => {
    document.body.innerHTML = markup;
    const before = document.documentElement.outerHTML;

    const { data } = await send({ action: 'extractContent' });

    expect(data.mainText).toBe(expected);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('strips navigation, scripts, ads, and comments from the extracted text', async () => {
    document.body.innerHTML = `
      <main>
        <nav>skip to content</nav>
        <script>var tracking = 1;</script>
        <style>.a{color:red}</style>
        <div class="ad">buy this</div>
        <div class="comments">first!</div>
        <aside>related links</aside>
        <p>the actual article</p>
      </main>`;

    const { data } = await send({ action: 'extractContent' });

    expect(data.mainText).toContain('the actual article');
    for (const noise of [
      'skip to content',
      'var tracking',
      'buy this',
      'first!',
      'related links',
    ]) {
      expect(data.mainText).not.toContain(noise);
    }
  });

  // The script is read-only by design; excluded nodes remain in the source DOM.
  it('does not modify the live page while excluding navigation', async () => {
    document.body.innerHTML =
      '<main><nav id="nav">menu</nav><p>text</p></main>';
    const before = document.documentElement.outerHTML;

    await send({ action: 'extractContent' });

    expect(document.documentElement.outerHTML).toBe(before);
    expect(document.getElementById('nav')).not.toBeNull();
  });

  it('reports headings with their levels, skipping empty ones', async () => {
    document.body.innerHTML = '<h1>Title</h1><h3>Sub</h3><h2>  </h2>';

    const { data } = await send({ action: 'extractContent' });

    expect(data.headings).toEqual([
      { level: 1, text: 'Title' },
      { level: 3, text: 'Sub' },
    ]);
  });

  it('falls back to the first h1 when the document has no title', async () => {
    document.title = '';
    document.body.innerHTML = '<h1>Heading Instead</h1>';

    const { data } = await send({ action: 'extractContent' });

    expect(data.title).toBe('Heading Instead');
  });

  it('reports an unknown language when the document declares none', async () => {
    document.documentElement.removeAttribute('lang');

    const { data } = await send({ action: 'extractContent' });

    expect(data.language).toBe('unknown');
  });
});

describe('getPageMetadata', () => {
  it('collects meta tags by name and by property', async () => {
    document.head.innerHTML = `
      <meta name="description" content="a description">
      <meta property="og:title" content="social title">
      <meta content="orphan with no name">`;

    const { data } = await send({ action: 'getPageMetadata' });

    expect(data).toMatchObject({
      description: 'a description',
      'og:title': 'social title',
    });
    expect(Object.values(data)).not.toContain('orphan with no name');
  });
});

describe('extractSelection', () => {
  it('returns null when nothing is selected', async () => {
    const { success, data } = await send({ action: 'extractSelection' });

    expect(success).toBe(true);
    expect(data).toBeNull();
  });
});

describe('extractLinks', () => {
  it('returns absolute http links and flags external ones', async () => {
    document.body.innerHTML = `
      <a href="/local">Local</a>
      <a href="https://example.com/away">Away</a>
      <a href="mailto:someone@example.com">Mail</a>
      <a>no href at all</a>`;

    const { data } = await send({ action: 'extractLinks' });

    expect(data).toHaveLength(2);
    expect(data.find(l => l.text === 'Local').isExternal).toBe(false);
    expect(data.find(l => l.text === 'Away').isExternal).toBe(true);
    expect(data.some(l => l.href.startsWith('mailto:'))).toBe(false);
  });
});

describe('extractImages', () => {
  it('skips inline data URIs and images with no source', async () => {
    document.body.innerHTML = `
      <img src="https://example.com/a.png" alt="A picture">
      <img src="data:image/gif;base64,R0lGOD">
      <img alt="no source">`;

    const { data } = await send({ action: 'extractImages' });

    expect(data).toEqual([
      expect.objectContaining({
        src: 'https://example.com/a.png',
        alt: 'A picture',
      }),
    ]);
  });
});

describe('unknown actions', () => {
  // A silent no-op here would surface as an unexplained empty popup.
  it('reports the action it could not handle', async () => {
    const response = await send({ action: 'summonDemons' });

    expect(response.success).toBe(false);
    expect(response.error).toContain('summonDemons');
  });
});
