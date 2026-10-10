import { describe, expect, test } from 'vitest';
import { hydratesPrerender } from './mountApp';

const root = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
};
const published = (body: string) =>
  root(`<!--prerender:start-->${body}<!--prerender:end-->`);

describe('hydratesPrerender', () => {
  test('hydrates any published page', () => {
    expect(
      hydratesPrerender(published('<main class="home-page"></main>'), '/'),
    ).toBe(true);
    expect(
      hydratesPrerender(
        published('<main class="not-found"></main>'),
        '/posts/missing',
      ),
    ).toBe(true);
  });

  test('renders from scratch with no prerender', () => {
    expect(hydratesPrerender(root(''), '/')).toBe(false);
    expect(
      hydratesPrerender(root('<main class="home-page"></main>'), '/'),
    ).toBe(false);
  });

  test.each([
    [
      '/projects/notebook',
      '<main class="project-page" data-slug="notebook"></main>',
      true,
    ],
    [
      '/projects/notebook/',
      '<main class="project-page" data-slug="notebook"></main>',
      true,
    ],
    [
      '/projects/posts',
      '<main class="project-page" data-slug="notebook"></main>',
      false,
    ],
    [
      '/posts/hello',
      '<main class="post-page"><article data-slug="hello"></article></main>',
      true,
    ],
    [
      '/posts/other',
      '<main class="post-page"><article data-slug="hello"></article></main>',
      false,
    ],
  ])('%s over %s hydrates: %s', (path, body, hydrates) => {
    expect(hydratesPrerender(published(body), path)).toBe(hydrates);
  });
});
