import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

/**
 * `content.js` is a classic content script: it exports nothing and registers a
 * `chrome.runtime.onMessage` listener when it loads. Tests drive it the same way
 * Chrome does — import once for the side effect, capture the listener, and send
 * it messages — which is also how `tests/integration` drives `background.js`.
 *
 * Note that jsdom does not implement `innerText`, so these exercise the
 * `|| textContent` fallback in `getMainText()` rather than the innerText path.
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
    document.body.innerHTML = '<article><p>The body of the article.</p></article>';

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
    for (const noise of ['skip to content', 'var tracking', 'buy this', 'first!', 'related links']) {
      expect(data.mainText).not.toContain(noise);
    }
  });

  // The script is read-only by design; stripping happens on a clone so the page
  // the user is looking at is never altered.
  it('does not modify the live page while stripping', async () => {
    document.body.innerHTML = '<main><nav id="nav">menu</nav><p>text</p></main>';

    await send({ action: 'extractContent' });

    expect(document.getElementById('nav')).not.toBeNull();
  });

  it('reports headings with their levels, skipping empty ones', async () => {
    document.body.innerHTML = '<h1>Title</h1><h3>Sub</h3><h2>  </h2>';

    const { data } = await send({ action: 'extractContent' });

    expect(data.headings).toEqual([
      { level: 1, text: 'Title' },
      { level: 3, text: 'Sub' }
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

    expect(data).toMatchObject({ description: 'a description', 'og:title': 'social title' });
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

    expect(data).toEqual([expect.objectContaining({
      src: 'https://example.com/a.png',
      alt: 'A picture'
    })]);
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
