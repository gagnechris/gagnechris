import { act, createElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { hydratesPrerender, mountApp } from './mountApp';

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

describe('mountApp hydration error reporting', () => {
  const gtag = vi.fn();
  let unmount: (() => void) | undefined;

  const hydrate = async (serverText: string, clientText: string) => {
    window.gtag = gtag;
    const container = published(`<p>${serverText}</p>`);
    document.body.append(container);
    await act(async () => {
      const root = mountApp(
        container,
        createElement('p', null, clientText),
        '/posts',
      );
      unmount = () => root.unmount();
    });
  };

  afterEach(() => {
    act(() => unmount?.());
    unmount = undefined;
    document.body.innerHTML = '';
    gtag.mockReset();
    vi.restoreAllMocks();
  });

  test('a mismatch sends the path and the kind of error, never the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await hydrate('Published text', 'Other text');

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'hydration_error', {
      page_path: '/posts',
      error_kind: 'text_mismatch',
    });
    expect(JSON.stringify(gtag.mock.calls)).not.toMatch(/Published|Other/);
  });

  test('a clean hydrate sends nothing', async () => {
    await hydrate('Same text', 'Same text');

    expect(gtag).not.toHaveBeenCalled();
  });
});
