import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  applyPageMeta,
  DEFAULT_RESUME,
  pageTitle,
  renderPostPageBodyHtml,
  projectPageView,
} from '@gagnechris/shared/render';
import { selectHomeProjects } from '@gagnechris/shared';
import {
  renderHomePrerenderHtml,
  renderPostsIndexBodyHtml,
  renderProjectPagePrerenderHtml,
  renderProjectsIndexPrerenderHtml,
  renderResumePrerenderHtml,
  renderResumeUnavailablePrerenderHtml,
  renderSitePageHtml,
} from '@gagnechris/public-ui/server';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import {
  applyNotFoundPageMeta,
  applyStaticPageMeta,
  NOT_FOUND_PRERENDER,
  STATIC_PAGE_META,
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

const SHELL = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

const headOf = (html: string): string =>
  new DOMParser().parseFromString(html, 'text/html').head.innerHTML;

/** As the publisher writes them; the custom SEO titles must survive the mount. */
const publishedHead = (path: string, title: string): string =>
  headOf(
    applyPageMeta(SHELL, {
      title,
      description: 'Published description.',
      url: `https://gagnechris.com${path === '/' ? '' : path}`,
      type: path.startsWith('/posts/') ? 'article' : 'website',
    }),
  );

const HEADS: Record<string, string> = {
  '/': publishedHead('/', 'Home SEO title'),
  '/projects': publishedHead('/projects', pageTitle('Projects')),
  '/projects/posts': publishedHead('/projects/posts', pageTitle('Posts')),
  '/posts': publishedHead('/posts', pageTitle('Posts')),
  '/posts/hello-world': publishedHead('/posts/hello-world', 'Post SEO title'),
  '/resume': publishedHead('/resume', 'Resume SEO title'),
};

const staticHead = (routePath: string): string =>
  headOf(
    applyStaticPageMeta(
      SHELL,
      STATIC_PAGE_META.find((meta) => meta.routePath === routePath)!,
    ),
  );

const NOT_FOUND_HEAD = headOf(applyNotFoundPageMeta(SHELL));

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
 * modules (which snapshot it on import), then `mountApp` as `main.tsx` calls it.
 * Fetch never settles, so anything on screen came from the first render.
 */
async function coldLoad(
  path: string,
  prerender: string,
  head = '',
  onRecoverableError?: (error: unknown) => void,
) {
  window.history.replaceState(null, '', path);
  document.head.innerHTML = head;
  document.body.innerHTML = `<div id="root">${prerender}</div>`;
  const root = document.getElementById('root')!;
  const before = {
    text: text(root),
    html: root.innerHTML,
    main: root.querySelector('main'),
    header: root.querySelector('header'),
    head: document.head.innerHTML,
    title: document.title,
  };

  vi.resetModules();
  const [{ act }, { mountApp }, router, { routes }] = await Promise.all([
    import('react'),
    import('../prerender/mountApp'),
    import('react-router-dom'),
    import('../routes'),
  ]);
  let reactRoot!: ReturnType<typeof mountApp>;
  await act(async () => {
    reactRoot = mountApp(
      root,
      <router.RouterProvider
        router={router.createMemoryRouter(routes, { initialEntries: [path] })}
      />,
      path,
      onRecoverableError && { onRecoverableError },
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
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.history.replaceState(null, '', '/');
  });

  test.each(Object.entries(PRERENDERS))('%s', async (path, prerender) => {
    const loaded = await coldLoad(path, prerender, HEADS[path]);
    unmount = loaded.unmount;

    expect(document.head.innerHTML).toBe(loaded.before.head);
    expect(document.title).toBe(loaded.before.title);

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
    [
      'with a preview image',
      renderProjectsIndexPrerenderHtml(
        SAMPLE_PROJECTS.map((p) =>
          p.slug === 'notebook'
            ? { ...p, previewImage: '/media/notebook.png' }
            : p,
        ),
      ),
    ],
    ['with nothing published', renderProjectsIndexPrerenderHtml([])],
  ])('/projects %s hydrates the published markup in place', async (_, html) => {
    const onRecoverableError = vi.fn();
    const loaded = await coldLoad(
      '/projects',
      `<!--prerender:start-->${html}<!--prerender:end-->`,
      HEADS['/projects'],
      onRecoverableError,
    );
    unmount = loaded.unmount;

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(loaded.root.querySelector('main')).toBe(loaded.before.main);
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
          'Part of the Notebook and Bears projects',
        );
      }
    },
  );

  test.each([
    ['with posts', PRERENDERS['/posts']!],
    [
      'with two posts on one day',
      renderSitePageHtml(
        '/posts',
        renderPostsIndexBodyHtml([
          {
            id: '01J9',
            slug: 'later',
            title: 'Later',
            excerpt: '',
            publishedAt: '2026-09-28T10:00:00.000Z',
          },
          {
            id: '01J1',
            slug: 'earlier',
            title: 'Earlier',
            excerpt: '',
            publishedAt: '2026-09-28T09:00:00.000Z',
          },
        ]),
      ),
    ],
    [
      'with nothing published',
      renderSitePageHtml('/posts', renderPostsIndexBodyHtml([])),
    ],
  ])('/posts %s hydrates the published markup in place', async (_, html) => {
    const onRecoverableError = vi.fn();
    const loaded = await coldLoad(
      '/posts',
      `<!--prerender:start-->${html}<!--prerender:end-->`,
      HEADS['/posts'],
      onRecoverableError,
    );
    unmount = loaded.unmount;

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(loaded.root.querySelector('main')).toBe(loaded.before.main);
    expect(loaded.root.innerHTML).toBe(loaded.before.html);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('/posts published last year hydrates, then shows the live year', async () => {
    const html = PRERENDERS['/posts']!;
    const published = new Date().getFullYear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(published + 1, 0, 2));
    try {
      const onRecoverableError = vi.fn();
      const loaded = await coldLoad('/posts', html, '', onRecoverableError);
      unmount = loaded.unmount;

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(loaded.root.querySelector('main')).toBe(loaded.before.main);
      expect(
        loaded.root.querySelector('.site-footer__copy')?.textContent,
      ).toContain(String(published + 1));
    } finally {
      vi.useRealTimers();
    }
  });

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
    '%s served the 404 page hydrates it: same DOM, no section current, no fetch',
    async (path) => {
      const onRecoverableError = vi.fn();
      const loaded = await coldLoad(
        path,
        NOT_FOUND_PRERENDER,
        NOT_FOUND_HEAD,
        onRecoverableError,
      );
      unmount = loaded.unmount;

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(loaded.root.querySelector('main')).toBe(loaded.before.main);
      expect(loaded.root.innerHTML).toBe(loaded.before.html);
      expect(document.head.innerHTML).toBe(loaded.before.head);
      expect(loaded.root.querySelector('[aria-current]')).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test('/contact hydrates the prerendered chrome and heading, then adds the form below', async () => {
    const onRecoverableError = vi.fn();
    const prerender = withoutMarkers(staticPagePrerender('contact')!);
    const loaded = await coldLoad(
      '/contact',
      staticPagePrerender('contact')!,
      staticHead('contact'),
      onRecoverableError,
    );
    unmount = loaded.unmount;

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(loaded.root.querySelector('main')).toBe(loaded.before.main);
    expect(document.head.innerHTML).toBe(loaded.before.head);

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
      loaded.root.querySelector(
        'main.contact-page > .contact-page__header + .contact-page__body > form',
      ),
    ).not.toBeNull();
  });

  test.each(Object.entries(BEARS_PAGES))(
    '%s: hydrates the chrome-only prerender while the chunk loads',
    async (path, page) => {
      vi.doMock(page, () => new Promise(() => {}));
      const onRecoverableError = vi.fn();
      const loaded = await coldLoad(
        path,
        staticPagePrerender(path.slice(1) as 'dont-feed-the-bears')!,
        '',
        onRecoverableError,
      );
      unmount = loaded.unmount;

      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(loaded.root.querySelector('header')).toBe(loaded.before.header);
      expect(loaded.root.innerHTML).toBe(loaded.before.html);
      expect(text(loaded.root)).not.toMatch(/Loading/);
    },
  );

  test.each(Object.keys(BEARS_PAGES))(
    '%s: the chrome and head do not change when the page arrives',
    async (path) => {
      const prerender = withoutMarkers(
        staticPagePrerender(path.slice(1) as 'dont-feed-the-bears')!,
      );
      const loaded = await coldLoad(path, prerender, staticHead(path.slice(1)));
      unmount = loaded.unmount;

      await vi.waitFor(() =>
        expect(loaded.root.querySelector('h1')).not.toBeNull(),
      );
      expect(document.head.innerHTML).toBe(loaded.before.head);
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
