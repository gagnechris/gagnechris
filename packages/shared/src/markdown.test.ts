import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml } from './markdown.js';
import { slugify } from './slugify.js';

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

describe('slugify', () => {
  it('slugifies titles', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Café  au lait ')).toBe('cafe-au-lait');
  });

  it('returns empty for blank input', () => {
    expect(slugify('   ')).toBe('');
  });
});
