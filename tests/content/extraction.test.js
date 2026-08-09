import { describe, it, expect, beforeEach } from 'vitest';

// content.js is a classic script (MV3 declarative content scripts cannot be
// modules), so it exposes the class on globalThis rather than exporting it.
// Importing for side effects is what makes it available here.
import '../../content.js';

/** @type {any} */
const PageContentExtractor = globalThis.PageContentExtractor;

/**
 * Unit coverage for the content script's DOM reading.
 *
 * The e2e suite proves extraction works in real Chrome on one fixture page;
 * these cover the edge cases that are tedious to stage in a browser — missing
 * containers, malformed markup, hostile URLs.
 *
 * Note: jsdom does not implement `innerText`, so these exercise the
 * `textContent` fallback in getMainText(). Real Chrome takes the `innerText`
 * path, which additionally drops hidden elements — the e2e test covers that.
 */

/** @param {string} html */
function setBody(html) {
  document.body.innerHTML = html;
}

describe('PageContentExtractor', () => {
  /** @type {any} */
  let extractor;

  it('is loadable as a classic script, with no ESM syntax', async () => {
    // Regression guard: adding `export` here is a parse error in a real content
    // script, so extraction silently stops working everywhere. Only the
    // browser e2e suite catches that, and it costs a full browser launch.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // Resolved from cwd: the jsdom environment gives import.meta.url an http
    // base, which readFileSync rejects.
    const source = readFileSync(resolve(process.cwd(), 'content.js'), 'utf8');

    expect(source).not.toMatch(/^\s*export\s/m);
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  beforeEach(() => {
    extractor = new PageContentExtractor();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.title = '';
  });

  describe('getMainText', () => {
    it('prefers <article> over the whole body', () => {
      setBody(`
        <nav>Site navigation</nav>
        <article><p>The actual article body.</p></article>
        <footer>Legal boilerplate</footer>
      `);

      const text = extractor.getMainText();
      expect(text).toContain('The actual article body.');
      expect(text).not.toContain('Site navigation');
      expect(text).not.toContain('Legal boilerplate');
    });

    it('falls through the selector list to [role=main] then <main>', () => {
      setBody('<div role="main"><p>Role main content.</p></div>');
      expect(extractor.getMainText()).toContain('Role main content.');

      setBody('<main><p>Main element content.</p></main>');
      expect(extractor.getMainText()).toContain('Main element content.');
    });

    it('falls back to body when no content container exists', () => {
      setBody('<div><p>Loose paragraph.</p></div>');
      expect(extractor.getMainText()).toContain('Loose paragraph.');
    });

    it('strips scripts, styles, ads, sidebars and comments', () => {
      setBody(`
        <article>
          <p>Keep this.</p>
          <script>window.tracker = 1;</script>
          <style>.x { color: red }</style>
          <div class="ad">Buy now</div>
          <div class="sidebar">Related links</div>
          <div class="comments">First!</div>
          <aside>Aside content</aside>
        </article>
      `);

      const text = extractor.getMainText();
      expect(text).toContain('Keep this.');
      for (const noise of [
        'window.tracker',
        'color: red',
        'Buy now',
        'Related links',
        'First!',
        'Aside content'
      ]) {
        expect(text).not.toContain(noise);
      }
    });

    it('does not mutate the live page while stripping', () => {
      // Extraction works on a clone. Removing nodes from the real document
      // would visibly break the page the user is reading.
      setBody('<article><p>Body</p><script>var a = 1;</script></article>');

      extractor.getMainText();

      expect(document.querySelector('script')).not.toBeNull();
      expect(document.querySelector('article p')).not.toBeNull();
    });

    it('returns an empty string for an empty document', () => {
      setBody('');
      expect(extractor.getMainText()).toBe('');
    });
  });

  describe('getPageTitle', () => {
    it('uses document.title when present', () => {
      document.title = 'Real Title';
      expect(extractor.getPageTitle()).toBe('Real Title');
    });

    it('falls back to the first h1', () => {
      document.title = '';
      setBody('<h1>  Heading Title  </h1>');
      expect(extractor.getPageTitle()).toBe('Heading Title');
    });

    it('falls back to a placeholder when there is nothing', () => {
      document.title = '';
      setBody('');
      expect(extractor.getPageTitle()).toBe('Untitled Page');
    });
  });

  describe('extractHeadings', () => {
    it('records level and text in document order', () => {
      setBody('<h1>One</h1><h3>Three</h3><h2>Two</h2>');

      expect(extractor.extractHeadings()).toEqual([
        { level: 1, text: 'One' },
        { level: 3, text: 'Three' },
        { level: 2, text: 'Two' }
      ]);
    });

    it('drops headings with no text', () => {
      setBody('<h1>Real</h1><h2></h2><h3>   </h3>');
      expect(extractor.extractHeadings()).toEqual([{ level: 1, text: 'Real' }]);
    });
  });

  describe('getPageMetadata', () => {
    it('reads both name and property meta tags', () => {
      document.head.innerHTML = `
        <meta name="description" content="A description">
        <meta property="og:title" content="Open Graph Title">
      `;

      expect(extractor.getPageMetadata()).toEqual({
        description: 'A description',
        'og:title': 'Open Graph Title'
      });
    });

    it('skips meta tags with no name or no content', () => {
      document.head.innerHTML = `
        <meta content="orphan content">
        <meta name="empty">
        <meta charset="utf-8">
      `;
      expect(extractor.getPageMetadata()).toEqual({});
    });
  });

  describe('extractLinks', () => {
    it('keeps http(s) links and marks external ones', () => {
      setBody(`
        <a href="https://example.com/other">External</a>
        <a href="/relative">Relative</a>
      `);

      const links = extractor.extractLinks();
      const external = links.find(l => l.text === 'External');
      const relative = links.find(l => l.text === 'Relative');

      expect(external?.isExternal).toBe(true);
      // jsdom serves pages from localhost, so a relative link is same-origin.
      expect(relative?.isExternal).toBe(false);
    });

    it('drops javascript: and mailto: links', () => {
      setBody(`
        <a href="javascript:alert(1)">Bad</a>
        <a href="mailto:a@b.com">Mail</a>
        <a href="https://example.com/ok">Good</a>
      `);

      const hrefs = extractor.extractLinks().map(l => l.href);
      expect(hrefs).toEqual(['https://example.com/ok']);
    });

    it('ignores anchors without href', () => {
      setBody('<a>No href</a>');
      expect(extractor.extractLinks()).toEqual([]);
    });
  });

  describe('extractImages', () => {
    it('drops inline data URIs, which are not useful to report', () => {
      setBody(`
        <img src="https://example.com/a.png" alt="A picture">
        <img src="data:image/png;base64,iVBORw0KGgo=" alt="Inline">
      `);

      const images = extractor.extractImages();
      expect(images).toHaveLength(1);
      expect(images[0].alt).toBe('A picture');
    });
  });

  describe('extractSelectedText', () => {
    it('returns null when nothing is selected', () => {
      setBody('<p>Some text</p>');
      expect(extractor.extractSelectedText()).toBeNull();
    });
  });

  describe('handleMessage', () => {
    it('routes each supported action', async () => {
      document.title = 'Routing';
      setBody('<article><p>Content</p></article>');

      await expect(extractor.handleMessage({ action: 'extractContent' }))
        .resolves.toMatchObject({ title: 'Routing' });
      await expect(extractor.handleMessage({ action: 'extractLinks' }))
        .resolves.toEqual([]);
      await expect(extractor.handleMessage({ action: 'getPageMetadata' }))
        .resolves.toEqual({});
      await expect(extractor.handleMessage({ action: 'extractImages' }))
        .resolves.toEqual([]);
    });

    it('rejects an unknown action instead of returning nothing', async () => {
      await expect(extractor.handleMessage({ action: 'deleteEverything' }))
        .rejects.toThrow(/Unknown action/);
    });

    it('reports a language of unknown rather than guessing English', () => {
      document.documentElement.removeAttribute('lang');
      expect(extractor.extractPageContent().language).toBe('unknown');
    });
  });
});
