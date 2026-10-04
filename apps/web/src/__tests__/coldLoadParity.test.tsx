import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_RESUME,
  renderHomePrerenderHtml,
  renderPostPageBodyHtml,
  renderPostsIndexBodyHtml,
  renderResumePrerenderHtml,
  renderResumeUnavailablePrerenderHtml,
  renderSitePageHtml,
} from '@gagnechris/shared/render';

vi.mock('../utils/analytics');

const PUBLISHED_HOME = {
  name: 'Christopher Gagne',
  title: 'Published title',
  about: 'Published about.\n\nSecond paragraph.',
  status: 'published' as const,
  publishedAt: '2026-09-27T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
  seo: null,
  version: 3,
  hasUnpublishedChanges: false,
};

// Content that differs from the bundled defaults, so a page that renders
// DEFAULT_HOME / DEFAULT_RESUME or a loading state first can't pass.
const PRERENDERS: Record<string, string> = {
  '/': renderHomePrerenderHtml(PUBLISHED_HOME, [
    {
      id: '01B',
      slug: 'second',
      title: 'Second post',
      excerpt: 'The newer one.',
      publishedAt: '2026-09-28T09:00:00.000Z',
    },
    {
      id: '01A',
      slug: 'first',
      title: 'First post',
      excerpt: '',
      publishedAt: '2026-02-01T00:00:00.000Z',
    },
  ]),
  '/posts': renderSitePageHtml(
    '/posts',
    renderPostsIndexBodyHtml([
      {
        id: '01B',
        slug: 'second',
        title: 'Second post',
        excerpt: 'The newer one.',
        publishedAt: '2026-09-28T09:00:00.000Z',
      },
      {
        id: '01A',
        slug: 'first',
        title: 'First post',
        excerpt: '',
        publishedAt: '2026-02-01T00:00:00.000Z',
      },
    ]),
  ),
  '/posts/hello-world': renderSitePageHtml(
    '/posts',
    renderPostPageBodyHtml({
      slug: 'hello-world',
      title: 'Hello World',
      publishedAt: '2026-09-27T12:00:00.000Z',
      bodyMarkdown: '## Intro\n\nSome **bold** text and a [link](/resume).',
    }),
  ),
  '/resume': renderResumePrerenderHtml({
    ...DEFAULT_RESUME,
    name: 'Christopher M. Gagne',
    content: { ...DEFAULT_RESUME.content, summary: 'Published summary.' },
  }),
};

const text = (el: Element): string =>
  (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * Loads the app the way the browser does: prerendered `#root` first, then the
 * modules (which snapshot it on import), then `createRoot` over the top.
 * Fetch never settles, so anything on screen came from the first render.
 */
async function coldLoad(path: string, prerender: string) {
  document.body.innerHTML = `<div id="root">${prerender}</div>`;
  const root = document.getElementById('root')!;
  const before = { text: text(root), html: root.innerHTML };

  vi.resetModules();
  const [{ act }, { createRoot }, router, { routes }] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('react-router-dom'),
    import('../routes'),
  ]);
  const reactRoot = createRoot(root);
  await act(async () => {
    reactRoot.render(
      <router.RouterProvider
        router={router.createMemoryRouter(routes, { initialEntries: [path] })}
      />,
    );
  });
  return { before, root, unmount: () => act(() => reactRoot.unmount()) };
}

describe('cold load: first React render matches the prerender', () => {
  let unmount: (() => void) | undefined;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubEnv('VITE_LOCAL_SITE_ORIGIN', '');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    document.body.innerHTML = '';
  });

  test.each(Object.entries(PRERENDERS))('%s', async (path, prerender) => {
    const loaded = await coldLoad(path, prerender);
    unmount = loaded.unmount;

    expect(text(loaded.root)).toBe(loaded.before.text);
    expect(fetch).not.toHaveBeenCalled();
    // Same chrome element-for-element, so nothing above the page body moves.
    const header = loaded.root.querySelector('header.site-header');
    const footer = loaded.root.querySelector('footer.site-footer');
    expect(loaded.before.html.startsWith(header!.outerHTML)).toBe(true);
    expect(loaded.before.html.endsWith(footer!.outerHTML)).toBe(true);
  });

  test('/ mounts the same DOM as the prerender, Recent posts included', async () => {
    const loaded = await coldLoad('/', PRERENDERS['/']);
    unmount = loaded.unmount;

    expect(loaded.root.innerHTML).toBe(loaded.before.html);
    expect(loaded.root.querySelectorAll('.home-post')).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('/ with no posts has no Recent posts heading before or after mount', async () => {
    const loaded = await coldLoad('/', renderHomePrerenderHtml(PUBLISHED_HOME));
    unmount = loaded.unmount;

    expect(loaded.before.text).not.toContain('Recent posts');
    expect(loaded.root.innerHTML).toBe(loaded.before.html);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('/resume when unpublished', async () => {
    const loaded = await coldLoad(
      '/resume',
      renderResumeUnavailablePrerenderHtml(),
    );
    unmount = loaded.unmount;

    expect(text(loaded.root)).toBe(loaded.before.text);
    expect(text(loaded.root)).toContain('Resume available on request.');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('a prerender for another slug is not reused', async () => {
    const loaded = await coldLoad(
      '/posts/other-post',
      PRERENDERS['/posts/hello-world'],
    );
    unmount = loaded.unmount;

    expect(text(loaded.root)).not.toContain('Hello World');
    expect(fetch).toHaveBeenCalledWith('/posts/other-post/', expect.anything());
  });
});
