import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml } from './markdown.js';
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

describe('slugify', () => {
  it('slugifies titles', () => {
    expect(slugify('Hello World!')).toBe('hello-world');
    expect(slugify('  Café  au lait ')).toBe('cafe-au-lait');
  });

  it('returns empty for blank input', () => {
    expect(slugify('   ')).toBe('');
  });

  it('caps length at MAX_SLUG_LENGTH (CHR-145)', () => {
    const slug = slugify('a'.repeat(200));
    expect(slug.length).toBe(MAX_SLUG_LENGTH);
    expect(slug).toBe('a'.repeat(MAX_SLUG_LENGTH));
  });

  it('never ends with a hyphen after truncation (CHR-154)', () => {
    const slug = slugify('Word '.repeat(40).trim());
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });
});
