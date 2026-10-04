import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_RESUME,
  renderHomePrerenderHtml,
  renderPostPageBodyHtml,
  renderPostsIndexBodyHtml,
  projectPageView,
  renderProjectPagePrerenderHtml,
  renderProjectsIndexPrerenderHtml,
  renderResumePrerenderHtml,
  renderResumeUnavailablePrerenderHtml,
  renderSitePageHtml,
} from '@gagnechris/shared/render';
import { selectHomeProjects } from '@gagnechris/shared';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import {
  NOT_FOUND_PRERENDER,
  staticPagePrerender,
} from '../../scripts/staticPageMeta';

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

const PUBLISHED_RESUME = {
  ...DEFAULT_RESUME,
  content: {
    ...DEFAULT_RESUME.content,
    headline: 'Published headline',
    summary: 'Published summary.',
    earlierRolesThrough: 2013,
  },
};

const {
  headline: _headline,
  earlierRolesThrough: _cutoff,
  ...UNSET_CONTENT
} = PUBLISHED_RESUME.content;

// Content that differs from the bundled defaults, so a page that renders
// DEFAULT_HOME / DEFAULT_RESUME or a loading state first can't pass.
const PRERENDERS: Record<string, string> = {
  '/': renderHomePrerenderHtml(
    PUBLISHED_HOME,
    [
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
    ],
    selectHomeProjects(SAMPLE_PROJECTS),
  ),
  '/projects': renderProjectsIndexPrerenderHtml(SAMPLE_PROJECTS),
  '/projects/posts': renderProjectPagePrerenderHtml(
    projectPageView(
      {
        ...SAMPLE_PROJECTS.find((p) => p.slug === 'posts')!,
        bodyMarkdown:
          '## Why I built it\n\nBecause.\n\n## How publishing works\n\n1. Write.\n2. Publish.',
      },
      [
        {
          id: '01A',
          slug: 'welcome',
          title: 'Welcome',
          publishedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
    ),
  ),
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
    renderPostPageBodyHtml(
      {
        slug: 'hello-world',
        title: 'Hello World',
        excerpt: 'A published excerpt.',
        publishedAt: '2026-09-27T12:00:00.000Z',
        bodyMarkdown: '## Intro\n\nSome **bold** text and a [link](/resume).',
      },
      [
        { name: 'Notebook', href: '/projects/notebook' },
        { name: 'Bears', href: '/dont-feed-the-bears' },
      ],
    ),
  ),
  '/resume': renderResumePrerenderHtml(PUBLISHED_RESUME),
};

/** The markers are replaced along with everything else in `#root`. */
const withoutMarkers = (html: string): string =>
  html.replace(/<!--prerender:(start|end)-->/g, '');

const BEARS_PAGES = {
  '/dont-feed-the-bears': '../pages/DontFeedTheBears.tsx',
  '/dont-feed-the-bears/camp': '../pages/bears/CampRules.tsx',
  '/dont-feed-the-bears/wild': '../pages/bears/StayWild.tsx',
} as const;

const text = (el: Element): string =>
  (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * Loads the app the way the browser does: prerendered `#root` first, then the
 * modules (which snapshot it on import), then `createRoot` over the top.
 * Fetch never settles, so anything on screen came from the first render.
 */
async function coldLoad(path: string, prerender: string) {
  window.history.replaceState(null, '', path);
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
    // A Try it slot below the fold: its demo chunk must not race the first render.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    unmount?.();
    unmount = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    for (const page of Object.values(BEARS_PAGES)) vi.doUnmock(page);
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  test.each(Object.entries(PRERENDERS))('%s', async (path, prerender) => {
    const loaded = await coldLoad(path, prerender);
    unmount = loaded.unmount;

    expect(text(loaded.root)).toBe(loaded.before.text);
    expect(text(loaded.root)).not.toMatch(/Loading/);
    expect(fetch).not.toHaveBeenCalled();
    // Same chrome element-for-element, so nothing above the page body moves.
    const header = loaded.root.querySelector('header.site-header');
    const footer = loaded.root.querySelector('footer.site-footer');
    expect(loaded.before.html.startsWith(header!.outerHTML)).toBe(true);
    expect(loaded.before.html.endsWith(footer!.outerHTML)).toBe(true);
  });

  test('/ mounts the same DOM as the prerender, Recent posts and What I’m building included', async () => {
    const loaded = await coldLoad('/', PRERENDERS['/']);
    unmount = loaded.unmount;

    expect(loaded.root.innerHTML).toBe(loaded.before.html);
    expect(loaded.root.querySelectorAll('.home-post')).toHaveLength(2);
    expect(loaded.root.querySelectorAll('.project-card')).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    ['with projects', PRERENDERS['/projects']!],
    ['with nothing published', renderProjectsIndexPrerenderHtml([])],
  ])('/projects %s mounts the same DOM as the prerender', async (_, html) => {
    const loaded = await coldLoad('/projects', html);
    unmount = loaded.unmount;

    expect(loaded.root.innerHTML).toBe(loaded.before.html);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each([
    ['with a demo slot and a Build log', PRERENDERS['/projects/posts']!],
    [
      'with no demo and no posts',
      renderProjectPagePrerenderHtml(
        projectPageView({
          ...SAMPLE_PROJECTS.find((p) => p.slug === 'posts')!,
          demo: null,
        }),
      ),
    ],
  ])(
    '/projects/posts %s mounts the same DOM as the prerender',
    async (_, html) => {
      const loaded = await coldLoad('/projects/posts', html);
      unmount = loaded.unmount;

      expect(loaded.root.innerHTML).toBe(loaded.before.html);
      expect(loaded.root.querySelector('.project-build-log')).not.toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test('a project prerender for another slug is not reused', async () => {
    const loaded = await coldLoad(
      '/projects/notebook',
      PRERENDERS['/projects/posts']!,
    );
    unmount = loaded.unmount;

    expect(loaded.root.querySelector('.project-header')).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      '/projects/notebook/',
      expect.anything(),
    );
  });

  test('/ with no posts has no Recent posts heading before or after mount', async () => {
    const loaded = await coldLoad('/', renderHomePrerenderHtml(PUBLISHED_HOME));
    unmount = loaded.unmount;

    expect(loaded.before.text).not.toContain('Recent posts');
    expect(loaded.root.innerHTML).toBe(loaded.before.html);
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each(['/posts', '/posts/hello-world'])(
    '%s keeps the prerendered markup',
    async (path) => {
      const loaded = await coldLoad(path, PRERENDERS[path]);
      unmount = loaded.unmount;

      expect(loaded.root.innerHTML).toBe(loaded.before.html);
      if (path === '/posts/hello-world') {
        expect(loaded.root.querySelector('.post-part-of')?.textContent).toBe(
          'Part of Notebook, Bears',
        );
      }
    },
  );

  test.each([
    ['with headline and earlier roles', PUBLISHED_RESUME],
    [
      'without headline or cut-off',
      { ...PUBLISHED_RESUME, content: UNSET_CONTENT },
    ],
  ])('/resume %s mounts the same DOM as the prerender', async (_, resume) => {
    const prerender = renderResumePrerenderHtml(resume);
    const loaded = await coldLoad('/resume', prerender);
    unmount = loaded.unmount;

    expect(loaded.root.innerHTML).toBe(loaded.before.html);
    expect(loaded.root.querySelector('.resume-download')).not.toBeNull();
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
    expect(loaded.root.innerHTML).toBe(loaded.before.html);
    expect(loaded.root.querySelector('.resume-download')).toBeNull();
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
  test.each(['/no-such-page', '/posts/missing', '/contact/typo'])(
    '%s served the 404 page: same DOM, no section current, no fetch',
    async (path) => {
      const prerender = withoutMarkers(NOT_FOUND_PRERENDER);
      const loaded = await coldLoad(path, prerender);
      unmount = loaded.unmount;

      expect(loaded.root.innerHTML).toBe(prerender);
      expect(loaded.root.querySelector('[aria-current]')).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test('/contact keeps the prerendered chrome and heading, and adds the form below', async () => {
    const prerender = withoutMarkers(staticPagePrerender('contact')!);
    const loaded = await coldLoad('/contact', prerender);
    unmount = loaded.unmount;

    const before = document.createElement('div');
    before.innerHTML = prerender;
    for (const selector of [
      'header.site-header',
      '.contact-page__header',
      'footer.site-footer',
    ]) {
      expect(loaded.root.querySelector(selector)!.outerHTML).toBe(
        before.querySelector(selector)!.outerHTML,
      );
    }
    expect(loaded.root.firstElementChild!.outerHTML).toBe(
      before.firstElementChild!.outerHTML,
    );
    expect(
      loaded.root.querySelector('.contact-page__header')!.nextElementSibling!
        .tagName,
    ).toBe('MAIN');
    expect(loaded.root.querySelector('form')).not.toBeNull();
  });

  test.each(Object.entries(BEARS_PAGES))(
    '%s: first render is the chrome-only prerender while the chunk loads',
    async (path, page) => {
      vi.doMock(page, () => new Promise(() => {}));
      const prerender = withoutMarkers(
        staticPagePrerender(path.slice(1) as 'dont-feed-the-bears')!,
      );
      const loaded = await coldLoad(path, prerender);
      unmount = loaded.unmount;

      expect(loaded.root.innerHTML).toBe(prerender);
      expect(text(loaded.root)).not.toMatch(/Loading/);
    },
  );

  test.each(Object.keys(BEARS_PAGES))(
    '%s: the chrome does not change when the page arrives',
    async (path) => {
      const prerender = withoutMarkers(
        staticPagePrerender(path.slice(1) as 'dont-feed-the-bears')!,
      );
      const loaded = await coldLoad(path, prerender);
      unmount = loaded.unmount;

      await vi.waitFor(() =>
        expect(loaded.root.querySelector('h1')).not.toBeNull(),
      );
      const before = document.createElement('div');
      before.innerHTML = prerender;
      expect(loaded.root.firstElementChild!.outerHTML).toBe(
        before.firstElementChild!.outerHTML,
      );
      expect(loaded.root.lastElementChild!.outerHTML).toBe(
        before.lastElementChild!.outerHTML,
      );
    },
  );
});
