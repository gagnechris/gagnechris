import { describe, expect, it } from 'vitest';
import { EVERY_MARKDOWN_ELEMENT } from './fixtures/every-markdown-element.js';
import { renderPostMarkdownToHtml } from './markdown.js';
import {
  countWords,
  readingMinutes,
  readingTimeLabel,
} from './post-reading.js';

const textOf = (html: string): string =>
  html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ');

describe('readingMinutes', () => {
  it('is words / 230, rounded, at least 1', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes('one two three')).toBe(1);
    expect(readingMinutes('word '.repeat(344))).toBe(1);
    expect(readingMinutes('word '.repeat(345))).toBe(2);
    expect(readingMinutes('word '.repeat(2300))).toBe(10);
  });

  it('counts the words a reader sees, not link targets or markup', () => {
    expect(countWords("Don't stop — it's 2026.")).toBe(4);
    const markdown =
      '## Title\n\nSee [the docs](https://example.com/a/b/c/d/e) and <span>this</span>.\n\n[ref]: https://example.com/x/y/z\n';
    expect(countWords(markdown)).toBeGreaterThan(
      countWords('Title See the docs and this'),
    );
    const words = 'word '.repeat(229);
    expect(
      readingMinutes(`${words}[x](https://example.com/${'/a'.repeat(400)})`),
    ).toBe(1);
  });

  it('gives the same minutes from markdown as from its rendered text', () => {
    const long = Array.from({ length: 12 }, () => EVERY_MARKDOWN_ELEMENT).join(
      '\n\n',
    );
    for (const markdown of [EVERY_MARKDOWN_ELEMENT, long]) {
      expect(readingMinutes(textOf(renderPostMarkdownToHtml(markdown)))).toBe(
        readingMinutes(markdown),
      );
    }
  });

  it('labels minutes', () => {
    expect(readingTimeLabel(3)).toBe('3 min read');
  });
});
