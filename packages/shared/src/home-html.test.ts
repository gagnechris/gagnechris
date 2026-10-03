import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME } from './home-default.js';
import {
  homeAboutExcerpt,
  renderHomeAboutHtml,
  renderHomeAboutSectionHtml,
  renderHomePrerenderHtml,
} from './home-html.js';
import type { Home } from './schemas.js';

const home = (overrides: Partial<Home> = {}): Home => ({
  ...DEFAULT_HOME,
  ...overrides,
});

describe('renderHomeAboutHtml', () => {
  it('wraps a single block in one paragraph', () => {
    expect(renderHomeAboutHtml('Just one line.')).toBe('<p>Just one line.</p>');
  });

  it('splits blank-line separated blocks into paragraphs', () => {
    expect(renderHomeAboutHtml('One.\n\nTwo.\n  \nThree.')).toBe(
      '<p>One.</p><p>Two.</p><p>Three.</p>',
    );
  });

  it('keeps single newlines inside a paragraph as breaks', () => {
    expect(renderHomeAboutHtml('One.\nStill one.')).toBe(
      '<p>One.<br />Still one.</p>',
    );
  });

  it('escapes HTML in the body text', () => {
    const html = renderHomeAboutHtml('<script>alert("x")</script> & 5 > 3');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('5 &gt; 3');
  });

  it('renders nothing for empty copy', () => {
    expect(renderHomeAboutHtml('   \n\n  ')).toBe('');
  });
});

describe('renderHomeAboutSectionHtml', () => {
  it('uses the App.css section id and body wrapper the SPA reads back', () => {
    const html = renderHomeAboutSectionHtml('Hello.');
    expect(html).toContain('<section id="about"><h2>About Me</h2>');
    expect(html).toContain('<div class="about-body"><p>Hello.</p></div>');
  });
});

describe('renderHomePrerenderHtml', () => {
  it('includes profile photo, Quick Links, and footer matching the React home', () => {
    const html = renderHomePrerenderHtml(home());
    expect(html).toContain('class="home-page home-page-prerender"');
    expect(html).toContain('class="home-header"');
    expect(html).toContain('src="/profile.jpg"');
    expect(html).toContain('class="profile"');
    expect(html).toContain('id="quick-links"');
    expect(html).toContain('href="/resume"');
    expect(html).toContain('href="/writing"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain('class="site-footer"');
    expect(html).toContain('href="/rss.xml"');
    expect(html).toContain('dont-feed-the-bears?from=footer');
  });

  it('exposes name and title as data attributes the SPA reads back', () => {
    const html = renderHomePrerenderHtml(home());
    expect(html).toContain('class="home-page home-page-prerender"');
    expect(html).toContain('data-name="Chris Gagne"');
    expect(html).toContain('data-title="Engineering Leader"');
    expect(html).toContain('<h1>Chris Gagne</h1>');
    expect(html).toContain('<p>Engineering Leader</p>');
    expect(html).toContain('<section id="about">');
  });

  it("preserves $$, $&, $`, $' in prerendered name/title/about", () => {
    const tricky = "Making $$$ with $$ and $& and $` and $'";
    const escaped = 'Making $$$ with $$ and $&amp; and $` and $&#39;';
    const html = renderHomePrerenderHtml(
      home({ name: tricky, title: tricky, about: 'echo $$\n\nand $&' }),
    );
    expect(html).toContain(`data-name="${escaped}"`);
    expect(html).toContain(`<h1>${escaped}</h1>`);
    expect(html).toContain('<p>echo $$</p>');
    expect(html).toContain('<p>and $&amp;</p>');
  });

  it('escapes quotes in data attributes', () => {
    const html = renderHomePrerenderHtml(
      home({ name: 'A "B"', title: 'C "D"' }),
    );
    expect(html).toContain('data-name="A &quot;B&quot;"');
    expect(html).toContain('data-title="C &quot;D&quot;"');
  });
});

describe('homeAboutExcerpt', () => {
  it('collapses whitespace and truncates on a word boundary', () => {
    expect(homeAboutExcerpt('  one   two  ')).toBe('one two');
    const long = homeAboutExcerpt('word '.repeat(80));
    expect(long.length).toBeLessThanOrEqual(201);
    expect(long.endsWith('…')).toBe(true);
  });
});
