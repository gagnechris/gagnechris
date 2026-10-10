import { describe, expect, it } from 'vitest';
import {
  HOME_RECENT_POSTS_LIMIT,
  homeAboutExcerpt,
  renderHomeAboutHtml,
  selectHomeRecentPosts,
  type HomeRecentPost,
} from './home-page.js';

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

const recent = (
  n: number,
  overrides: Partial<HomeRecentPost & { updatedAt: string }> = {},
) => ({
  id: `0${n}`,
  slug: `post-${n}`,
  title: `Post ${n}`,
  excerpt: `Excerpt ${n}.`,
  publishedAt: `2026-0${n}-01T00:00:00.000Z`,
  updatedAt: `2026-0${n}-01T00:00:00.000Z`,
  ...overrides,
});

describe('selectHomeRecentPosts', () => {
  it('keeps the newest three by publishedAt, then updatedAt', () => {
    const picked = selectHomeRecentPosts([
      recent(1),
      recent(4),
      recent(2),
      recent(3, { publishedAt: null, updatedAt: '2026-04-15T00:00:00.000Z' }),
      recent(5),
    ]);
    expect(picked.map((p) => p.slug)).toEqual(['post-5', 'post-3', 'post-4']);
    expect(picked).toHaveLength(HOME_RECENT_POSTS_LIMIT);
    expect(picked[0]).toEqual({
      id: '05',
      slug: 'post-5',
      title: 'Post 5',
      excerpt: 'Excerpt 5.',
      publishedAt: '2026-05-01T00:00:00.000Z',
    });
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
