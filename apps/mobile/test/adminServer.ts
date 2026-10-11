import type { Post, Project } from '@gagnechris/app-core';

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

/** The admin Posts and Projects APIs, site media uploads and a photo's local file. */
export function adminServer(posts: Post[], projects: Project[] = []) {
  const store = new Map(posts.map((post) => [post.id, post]));
  const projectStore = new Map(
    projects.map((project) => [project.id, project]),
  );
  const state = {
    store,
    projectStore,
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
    const action = match[3];
    const next = {
      ...current,
      ...(action ? {} : fields),
      version: current.version + 1,
      updatedAt: now(),
    } as Post | Project;
    if (input.method === 'DELETE') {
      next.status = 'deleted';
    } else if (action === 'publish') {
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
    map.set(next.id, next);
    return json(200, next);
  };

  return { fetch, state };
}
