import type { Home, Post, Project, Resume } from '@gagnechris/app-core';
import { DEFAULT_HOME, DEFAULT_RESUME } from '@gagnechris/shared';

export const makePost = (id: string, fields: Partial<Post> = {}): Post => ({
  id,
  slug: `post-${id}`,
  title: `Post ${id}`,
  excerpt: '',
  bodyMarkdown: '',
  tags: [],
  projectIds: [],
  coverImage: null,
  seo: null,
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-10-01T09:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
  ...fields,
});

export const makeProject = (
  id: string,
  fields: Partial<Project> = {},
): Project => ({
  id,
  slug: `project-${id}`,
  name: `Project ${id}`,
  pitch: '',
  stage: 'building',
  stageNote: '',
  previewImage: null,
  bodyMarkdown: '',
  stack: [],
  links: [],
  demo: null,
  order: 0,
  href: null,
  status: 'published',
  publishedAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
  ...fields,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const summary = ({
  excerpt: _excerpt,
  bodyMarkdown: _body,
  coverImage: _cover,
  seo: _seo,
  ...rest
}: Post) => rest;

export const UPLOAD_URL = 'https://uploads.test/put';

export const makeHome = (fields: Partial<Home> = {}): Home => ({
  ...DEFAULT_HOME,
  status: 'published',
  publishedAt: '2026-10-01T09:00:00.000Z',
  version: 1,
  ...fields,
});

/** The admin Posts, Projects, Home and Resume APIs, site media uploads and a photo's local file. */
export function adminServer(
  posts: Post[],
  projects: Project[] = [],
  pages: { home?: Home; resume?: Resume } = {},
) {
  const store = new Map(posts.map((post) => [post.id, post]));
  const projectStore = new Map(
    projects.map((project) => [project.id, project]),
  );
  const state = {
    store,
    projectStore,
    pages: {
      home: pages.home ?? makeHome(),
      resume: pages.resume ?? { ...DEFAULT_RESUME, version: 1 },
    } as { home: Home; resume: Resume },
    calls: [] as string[],
    uploads: [] as { contentType: string; contentLength: number }[],
  };
  let clock = Date.parse('2026-10-02T12:00:00.000Z');
  const now = () => new Date((clock += 1_000)).toISOString();
  let nextId = 1;

  const fetch = async (
    input: Request | string,
    init?: RequestInit,
  ): Promise<Response> => {
    if (typeof input === 'string') {
      if (input.startsWith('file:')) {
        return new Response(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }));
      }
      if (input === UPLOAD_URL && init?.method === 'PUT') {
        state.calls.push(`PUT ${UPLOAD_URL}`);
        return new Response(null, { status: 200 });
      }
      throw new Error(`Unexpected fetch ${input}`);
    }
    const url = new URL(input.url);
    const route = `${input.method} ${url.pathname}`;
    state.calls.push(route);
    if (route === 'POST /api/admin/media/upload-url') {
      const body = (await input.json()) as {
        contentType: string;
        contentLength: number;
      };
      state.uploads.push(body);
      return json(200, {
        uploadUrl: UPLOAD_URL,
        headers: { 'Content-Type': body.contentType },
        publicPath: `/media/upload-${state.uploads.length}.jpg`,
      });
    }
    if (route === 'GET /api/admin/projects') {
      return json(200, { items: [...projectStore.values()] });
    }
    if (route === 'POST /api/admin/projects') {
      const body = (await input.json()) as Partial<Project>;
      const project = makeProject(`new-${nextId++}`, {
        status: 'draft',
        publishedAt: null,
        ...body,
        updatedAt: now(),
      });
      projectStore.set(project.id, project);
      return json(201, project);
    }
    if (route === 'GET /api/admin/posts') {
      const status = url.searchParams.get('status');
      const q = url.searchParams.get('q')?.toLowerCase();
      const live = [...store.values()].filter((p) => p.status !== 'deleted');
      const items = live
        .filter((p) => !status || p.status === status)
        .filter((p) => !q || p.title.toLowerCase().includes(q))
        .map(summary);
      return json(200, {
        items,
        counts: {
          all: live.length,
          draft: live.filter((p) => p.status === 'draft').length,
          published: live.filter((p) => p.status === 'published').length,
        },
      });
    }
    if (route === 'POST /api/admin/posts') {
      const body = (await input.json()) as Partial<Post>;
      const post = makePost(`new-${nextId++}`, { ...body, updatedAt: now() });
      store.set(post.id, post);
      return json(201, post);
    }
    const page = url.pathname.match(
      /^\/api\/admin\/(home|resume)(?:\/(publish|unpublish|discard))?$/,
    );
    if (page) {
      const key = page[1] as 'home' | 'resume';
      const current = state.pages[key];
      if (input.method === 'GET') return json(200, current);
      const body = (await input.json()) as Record<string, unknown> & {
        version: number;
      };
      if (body.version !== current.version) {
        return json(412, {
          error: 'version_conflict',
          current,
          currentVersion: current.version,
        });
      }
      const { version: _version, ...fields } = body;
      const next = transition(current, page[2], fields);
      state.pages[key] = next as never;
      return json(200, next);
    }
    const match = url.pathname.match(
      /^\/api\/admin\/(posts|projects)\/([^/]+)(?:\/(publish|unpublish|discard))?$/,
    );
    const map = (match?.[1] === 'projects' ? projectStore : store) as Map<
      string,
      Post | Project
    >;
    const current = match ? map.get(match[2]!) : undefined;
    if (!match || !current) return json(404, { error: 'not_found' });
    if (input.method === 'GET') return json(200, current);
    const body = (await input.json()) as Record<string, unknown> & {
      version: number;
    };
    if (body.version !== current.version) {
      return json(412, {
        error: 'version_conflict',
        current,
        currentVersion: current.version,
      });
    }
    const { version: _version, ...fields } = body;
    const next =
      input.method === 'DELETE'
        ? {
            ...current,
            status: 'deleted',
            version: current.version + 1,
            updatedAt: now(),
          }
        : transition(current, match[3], fields);
    map.set(next.id, next as Post | Project);
    return json(200, next);
  };

  type Publishable = {
    status: string;
    publishedAt: string | null;
    hasUnpublishedChanges: boolean;
    version: number;
    updatedAt: string;
  };
  function transition<T extends Publishable>(
    current: T,
    action: string | undefined,
    fields: Record<string, unknown>,
  ): T {
    const next = {
      ...current,
      ...(action ? {} : fields),
      version: current.version + 1,
      updatedAt: now(),
    };
    if (action === 'publish') {
      next.status = 'published';
      next.publishedAt = current.publishedAt ?? now();
      next.hasUnpublishedChanges = false;
    } else if (action === 'unpublish') {
      next.status = 'draft';
      next.hasUnpublishedChanges = false;
    } else if (action === 'discard') {
      next.hasUnpublishedChanges = false;
    } else if (current.status === 'published') {
      next.hasUnpublishedChanges = true;
    }
    return next;
  }

  return { fetch, state };
}
