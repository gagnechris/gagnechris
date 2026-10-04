import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml, renderPostMarkdownToHtml } from './markdown.js';
import { MAX_SLUG_LENGTH, slugify } from './slugify.js';

describe('renderMarkdownToHtml', () => {
  it('renders GFM headings and emphasis', () => {
    const html = renderMarkdownToHtml('# Hello\n\n**bold** and *italic*');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders GFM tables', () => {
    const html = renderMarkdownToHtml('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<table');
  });
});

describe('renderMarkdownToHtml sanitizing', () => {
  const payloads: Array<[string, string]> = [
    ['img onerror', '<img src=x onerror="alert(1)">'],
    ['javascript: link', '[x](javascript:alert(1))'],
    ['iframe srcdoc', '<iframe srcdoc="<script>alert(1)</script>"></iframe>'],
    ['script tag', '<script>alert(1)</script>'],
    ['svg onload', '<svg onload="alert(1)"></svg>'],
    ['data: image', '![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)'],
    ['data: link', '[x](data:text/html,<script>alert(1)</script>)'],
    [
      'inline handler on a',
      '<a href="https://ok.test" onclick="alert(1)">x</a>',
    ],
    ['entity-encoded scheme', '<a href="jav&#x61;script:alert(1)">x</a>'],
    ['style attribute', '<p style="background:url(javascript:alert(1))">x</p>'],
    ['form', '<form action="https://evil.test"><button>x</button></form>'],
  ];

  it.each(payloads)('renders %s inert', (_name, markdown) => {
    const html = renderMarkdownToHtml(markdown).toLowerCase();
    expect(html).not.toMatch(/<script|<iframe|<svg|<form|<button/);
    expect(html).not.toMatch(/\son\w+\s*=/);
    expect(html).not.toMatch(/javascript:|data:|srcdoc|style=/);
  });

  it('keeps ordinary markdown output', () => {
    const html = renderMarkdownToHtml(
      [
        '## Title',
        '',
        '[site](https://example.com "Example") and [mail](mailto:a@b.test)',
        '',
        '![alt](https://example.com/a.png)',
        '',
        '- [x] done',
        '- [ ] todo',
        '',
        '```ts',
        'const a = 1;',
        '```',
        '',
        '~~gone~~',
        '',
        '| a | b |',
        '| :- | -: |',
        '| 1 | 2 |',
      ].join('\n'),
    );
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain(
      '<a href="https://example.com" title="Example">site</a>',
    );
    expect(html).toContain('<a href="mailto:a@b.test">mail</a>');
    expect(html).toContain('<img src="https://example.com/a.png" alt="alt" />');
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*>/);
    expect(html).toContain('checked');
    expect(html).toContain('<code class="language-ts">');
    expect(html).toContain('<del>gone</del>');
    expect(html).toContain('<td align="right">2</td>');
  });

  it('keeps relative and anchor links', () => {
    const html = renderMarkdownToHtml('[a](/posts/x) [b](#top)');
    expect(html).toContain('href="/posts/x"');
    expect(html).toContain('href="#top"');
  });

  it('drops non-checkbox inputs', () => {
    expect(renderMarkdownToHtml('<input type="text" value="x">')).not.toContain(
      '<input',
    );
  });
});

describe('slugify', () => {
  it('slugifies titles', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Café  au lait ')).toBe('cafe-au-lait');
  });

  it('returns empty for blank input', () => {
    expect(slugify('   ')).toBe('');
  });

  it('caps length at MAX_SLUG_LENGTH', () => {
    const slug = slugify('a'.repeat(200));
    expect(slug.length).toBe(MAX_SLUG_LENGTH);
    expect(slug).toBe('a'.repeat(MAX_SLUG_LENGTH));
  });

  it('never ends with a hyphen after truncation', () => {
    const slug = slugify('Word '.repeat(40).trim());
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });
});

describe('renderPostMarkdownToHtml', () => {
  const levels = (html: string) =>
    [...html.matchAll(/<h([1-6])>/g)].map(([, n]) => Number(n));

  it('starts body headings at h2 and never skips a level', () => {
    expect(levels(renderPostMarkdownToHtml('# A\n\n### B\n\n## C'))).toEqual([
      2, 3, 3,
    ]);
    expect(
      levels(renderPostMarkdownToHtml('## A\n\n#### B\n\n###### C\n\n## D')),
    ).toEqual([2, 3, 4, 2]);
    expect(levels(renderPostMarkdownToHtml('### Only'))).toEqual([2]);
    expect(levels(renderPostMarkdownToHtml('> # In a quote'))).toEqual([2]);
  });

  it('captions an image that has a title and sits alone in its paragraph', () => {
    expect(
      renderPostMarkdownToHtml('![A "cat"](https://x.test/c.jpg "Our <cat>")'),
    ).toBe(
      '<figure><img src="https://x.test/c.jpg" alt="A &quot;cat&quot;" /><figcaption>Our &lt;cat&gt;</figcaption></figure>',
    );
    expect(renderPostMarkdownToHtml('![cat](https://x.test/c.jpg)')).toBe(
      '<p><img src="https://x.test/c.jpg" alt="cat" /></p>\n',
    );
    expect(
      renderPostMarkdownToHtml('Inline ![cat](https://x.test/c.jpg "t") image'),
    ).not.toContain('<figure>');
  });

  it('keeps an unsafe image source out of a figure', () => {
    const html = renderPostMarkdownToHtml(
      '![x](javascript:alert(1) "caption")',
    ).toLowerCase();
    expect(html).not.toMatch(/javascript:|onerror/);
  });

  it('puts tables and code blocks in keyboard-focusable scroll boxes', () => {
    const html = renderPostMarkdownToHtml(
      '| a |\n| - |\n| 1 |\n\n```\ncode\n```\n\n| b |\n| - |\n| 2 |',
    );
    expect(
      html.match(
        /<div class="post-table" role="region" tabindex="0" aria-label="Table \d">/g,
      ),
    ).toEqual([
      '<div class="post-table" role="region" tabindex="0" aria-label="Table 1">',
      '<div class="post-table" role="region" tabindex="0" aria-label="Table 2">',
    ]);
    expect(html.match(/<\/table><\/div>/g)).toHaveLength(2);
    expect(html).toContain('<pre tabindex="0"><code>code');
  });

  it('is sanitized like every other markdown render', () => {
    const html = renderPostMarkdownToHtml(
      '<img src=x onerror="alert(1)"><script>alert(1)</script><pre onclick="x">y</pre>',
    ).toLowerCase();
    expect(html).not.toMatch(/<script|\son\w+\s*=/);
  });
});
