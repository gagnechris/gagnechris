// For every operation the spec says returns `ETag` or accepts `If-Match`,
// call the API over HTTP and check it does exactly that; the probed
// operations must also not do it unadvertised.
import { describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { buildOpenApiDocument } from '@gagnechris/shared/openapi';
import { notebookUser, siteAdmin } from './support/claims.js';
import { apiCalls } from './support/call.js';
import { useApi } from './support/harness.js';

const USER = 'user-concurrency-contract';

type Advertised = { etag: boolean; ifMatch: boolean };

type OpenApiOperation = {
  parameters?: Array<{ in?: string; name?: string }>;
  responses?: Record<string, { headers?: Record<string, unknown> }>;
};

function advertisedByOperation(): Map<string, Advertised> {
  const doc = buildOpenApiDocument();
  const out = new Map<string, Advertised>();
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const [method, raw] of Object.entries(item ?? {})) {
      const op = raw as OpenApiOperation;
      if (!op || typeof op !== 'object' || !('responses' in op)) continue;
      const etag = Object.entries(op.responses ?? {}).some(
        ([status, res]) =>
          status.startsWith('2') &&
          Object.keys(res.headers ?? {}).some(
            (h) => h.toLowerCase() === 'etag',
          ),
      );
      const ifMatch = (op.parameters ?? []).some(
        (p) => p.in === 'header' && p.name?.toLowerCase() === 'if-match',
      );
      out.set(`${method.toUpperCase()} ${path}`, { etag, ifMatch });
    }
  }
  return out;
}

const claimsFor = (path: string) =>
  path.startsWith('/api/admin/') ? siteAdmin(USER) : notebookUser(USER);

const h = useApi('http-concurrency');
const { call, ok } = apiCalls(h, { claims: claimsFor });

function openApiPathPattern(path: string): RegExp {
  const parts = path
    .split(/(\{[^}]+\})/)
    .map((part) =>
      part.startsWith('{')
        ? '[^/]+'
        : part.replace(/[.*+?^$()|[\]\\]/g, '\\$&'),
    );
  return new RegExp(`^${parts.join('')}$`);
}

/** A request whose body already carries the right `version` when it takes one. */
type Target = { path: string; version: number; body?: unknown };

let counter = 0;
const unique = () => `${Date.now().toString(36)}-${(counter += 1)}`;

let dayCounter = 0;
function nextDate(): string {
  dayCounter += 1;
  const d = new Date(Date.UTC(2026, 0, 1) + dayCounter * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const versionBody = (version: number) => ({ version });

async function post() {
  return ok('POST', '/api/admin/posts', {
    body: { title: `Post ${unique()}` },
  });
}
async function publishedPost() {
  const p = await post();
  return ok('POST', `/api/admin/posts/${p.id}/publish`, {
    body: versionBody(p.version),
  });
}
async function editedPublishedPost() {
  const p = await publishedPost();
  return ok('PUT', `/api/admin/posts/${p.id}`, {
    body: {
      version: p.version,
      excerpt: `edit ${unique()}`,
    },
  });
}

async function project() {
  return ok('POST', '/api/admin/projects', {
    body: { name: `Project ${unique()}` },
  });
}
async function publishedProject() {
  const p = await project();
  return ok('POST', `/api/admin/projects/${p.id}/publish`, {
    body: versionBody(p.version),
  });
}
async function editedPublishedProject() {
  const p = await publishedProject();
  return ok('PUT', `/api/admin/projects/${p.id}`, {
    body: {
      version: p.version,
      pitch: `edit ${unique()}`,
    },
  });
}

async function singleton(base: string) {
  return ok('GET', base);
}
async function publishedSingleton(base: string) {
  const s = await singleton(base);
  return ok('POST', `${base}/publish`, { body: versionBody(s.version) });
}
async function editedPublishedSingleton(base: string, edit: object) {
  const s = await publishedSingleton(base);
  return ok('PUT', base, { body: { version: s.version, ...edit } });
}

async function note() {
  return ok('POST', '/api/notebook/notes', {
    body: {
      id: ulid(),
      area: 'work',
      type: 'page',
      title: `Note ${unique()}`,
    },
  });
}
async function dailyNote() {
  const date = nextDate();
  const n = await ok('PUT', `/api/notebook/notes/daily/work/${date}`, {
    body: {
      id: ulid(),
      title: 'Daily',
    },
  });
  return { ...n, date };
}

const AREAS = '/api/notebook/areas';
const AREA_LIST = [
  { id: 'work', name: 'Work' },
  { id: 'personal', name: 'Personal' },
];
async function areas() {
  const a = await ok('GET', AREAS);
  return ok('PUT', AREAS, { body: { version: a.version, areas: AREA_LIST } });
}

const TEMPLATE = '/api/notebook/templates/daily/work';
async function dailyTemplate() {
  const t = await ok('GET', TEMPLATE);
  return ok('PUT', TEMPLATE, {
    body: {
      version: t.version,
      bodyMarkdown: `## ${unique()}\n`,
    },
  });
}

async function noteTemplate() {
  return ok('POST', '/api/notebook/templates/notes', {
    body: { id: ulid(), name: `Template ${unique()}` },
  });
}

async function task() {
  return ok('POST', '/api/notebook/tasks', {
    body: {
      id: ulid(),
      area: 'work',
      title: `Task ${unique()}`,
    },
  });
}
async function completedTask() {
  const t = await task();
  return ok('POST', `/api/notebook/tasks/${t.id}/complete`, {
    body: versionBody(t.version),
  });
}

const create = (path: string, body: () => unknown) => async () => ({
  path,
  version: 0,
  body: body(),
});

const onEntity =
  (
    setup: () => Promise<{ id: string; version: number }>,
    path: (id: string) => string,
    body: (version: number) => unknown = versionBody,
  ) =>
  async (): Promise<Target> => {
    const e = await setup();
    return { path: path(e.id), version: e.version, body: body(e.version) };
  };

const onSingleton =
  (
    setup: () => Promise<{ version: number }>,
    path: string,
    body: (version: number) => unknown = versionBody,
  ) =>
  async (): Promise<Target> => {
    const e = await setup();
    return { path, version: e.version, body: body(e.version) };
  };

const HOME = '/api/admin/home';
const RESUME = '/api/admin/resume';
const resumeEdit = { pdfPath: '/resume-contract.pdf' };

/**
 * Every route whose response is a versioned entity. Keys are OpenAPI
 * operation keys; a new versioned route that advertises `ETag` / `If-Match`
 * needs an entry here or the coverage test fails.
 */
const PROBES: Record<string, () => Promise<Target>> = {
  'POST /api/admin/posts': create('/api/admin/posts', () => ({
    title: `Post ${unique()}`,
  })),
  'GET /api/admin/posts/{id}': onEntity(
    post,
    (id) => `/api/admin/posts/${id}`,
    () => undefined,
  ),
  'PUT /api/admin/posts/{id}': onEntity(
    post,
    (id) => `/api/admin/posts/${id}`,
    (version) => ({ version, excerpt: 'contract' }),
  ),
  'POST /api/admin/posts/{id}/publish': onEntity(
    post,
    (id) => `/api/admin/posts/${id}/publish`,
  ),
  'POST /api/admin/posts/{id}/unpublish': onEntity(
    publishedPost,
    (id) => `/api/admin/posts/${id}/unpublish`,
  ),
  'POST /api/admin/posts/{id}/discard': onEntity(
    editedPublishedPost,
    (id) => `/api/admin/posts/${id}/discard`,
  ),
  'DELETE /api/admin/posts/{id}': onEntity(
    post,
    (id) => `/api/admin/posts/${id}`,
  ),

  'POST /api/admin/projects': create('/api/admin/projects', () => ({
    name: `Project ${unique()}`,
  })),
  'GET /api/admin/projects/{id}': onEntity(
    project,
    (id) => `/api/admin/projects/${id}`,
    () => undefined,
  ),
  'PUT /api/admin/projects/{id}': onEntity(
    project,
    (id) => `/api/admin/projects/${id}`,
    (version) => ({ version, pitch: 'contract' }),
  ),
  'POST /api/admin/projects/{id}/publish': onEntity(
    project,
    (id) => `/api/admin/projects/${id}/publish`,
  ),
  'POST /api/admin/projects/{id}/unpublish': onEntity(
    publishedProject,
    (id) => `/api/admin/projects/${id}/unpublish`,
  ),
  'POST /api/admin/projects/{id}/discard': onEntity(
    editedPublishedProject,
    (id) => `/api/admin/projects/${id}/discard`,
  ),
  'DELETE /api/admin/projects/{id}': onEntity(
    project,
    (id) => `/api/admin/projects/${id}`,
  ),

  'GET /api/admin/home': onSingleton(
    () => singleton(HOME),
    HOME,
    () => undefined,
  ),
  'PUT /api/admin/home': onSingleton(
    () => singleton(HOME),
    HOME,
    (version) => ({ version, about: `contract ${unique()}` }),
  ),
  'POST /api/admin/home/publish': onSingleton(
    () => singleton(HOME),
    `${HOME}/publish`,
  ),
  'POST /api/admin/home/unpublish': onSingleton(
    () => publishedSingleton(HOME),
    `${HOME}/unpublish`,
  ),
  'POST /api/admin/home/discard': onSingleton(
    () => editedPublishedSingleton(HOME, { about: `edit ${unique()}` }),
    `${HOME}/discard`,
  ),

  'GET /api/admin/resume': onSingleton(
    () => singleton(RESUME),
    RESUME,
    () => undefined,
  ),
  'PUT /api/admin/resume': onSingleton(
    () => singleton(RESUME),
    RESUME,
    (version) => ({ version, ...resumeEdit }),
  ),
  'POST /api/admin/resume/publish': onSingleton(
    () => singleton(RESUME),
    `${RESUME}/publish`,
  ),
  'POST /api/admin/resume/unpublish': onSingleton(
    () => publishedSingleton(RESUME),
    `${RESUME}/unpublish`,
  ),
  'POST /api/admin/resume/discard': onSingleton(
    () => editedPublishedSingleton(RESUME, { name: `Name ${unique()}` }),
    `${RESUME}/discard`,
  ),

  'POST /api/notebook/notes': create('/api/notebook/notes', () => ({
    id: ulid(),
    area: 'work',
    type: 'page',
    title: 'Created',
  })),
  'POST /api/notebook/recaps/weekly': create(
    '/api/notebook/recaps/weekly',
    () => ({ id: ulid(), area: 'work', weekStart: '2026-10-26' }),
  ),
  'GET /api/notebook/notes/{id}': onEntity(
    note,
    (id) => `/api/notebook/notes/${id}`,
    () => undefined,
  ),
  'PUT /api/notebook/notes/{id}': onEntity(
    note,
    (id) => `/api/notebook/notes/${id}`,
    (version) => ({ version, title: 'Updated' }),
  ),
  'DELETE /api/notebook/notes/{id}': onEntity(
    note,
    (id) => `/api/notebook/notes/${id}`,
  ),
  'GET /api/notebook/notes/daily/{area}/{date}': async () => {
    const n = await dailyNote();
    return {
      path: `/api/notebook/notes/daily/work/${n.date}`,
      version: n.version,
    };
  },
  'POST /api/notebook/notes/daily/{area}/{date}/open': async () => {
    const n = await dailyNote();
    return {
      path: `/api/notebook/notes/daily/work/${n.date}/open`,
      version: n.version,
      body: { id: ulid() },
    };
  },
  'PUT /api/notebook/notes/daily/{area}/{date}': async () => {
    const n = await dailyNote();
    return {
      path: `/api/notebook/notes/daily/work/${n.date}`,
      version: n.version,
      body: { id: n.id, version: n.version, title: 'Updated' },
    };
  },

  'GET /api/notebook/areas': onSingleton(areas, AREAS, () => undefined),
  'PUT /api/notebook/areas': onSingleton(areas, AREAS, (version) => ({
    version,
    areas: AREA_LIST,
  })),

  'GET /api/notebook/templates/daily/{area}': onSingleton(
    dailyTemplate,
    TEMPLATE,
    () => undefined,
  ),
  'PUT /api/notebook/templates/daily/{area}': onSingleton(
    dailyTemplate,
    TEMPLATE,
    (version) => ({ version, bodyMarkdown: '## Updated\n' }),
  ),
  'DELETE /api/notebook/templates/daily/{area}': onSingleton(
    dailyTemplate,
    TEMPLATE,
  ),

  'POST /api/notebook/templates/notes': create(
    '/api/notebook/templates/notes',
    () => ({ id: ulid(), name: 'Created' }),
  ),
  'GET /api/notebook/templates/notes/{id}': onEntity(
    noteTemplate,
    (id) => `/api/notebook/templates/notes/${id}`,
    () => undefined,
  ),
  'PUT /api/notebook/templates/notes/{id}': onEntity(
    noteTemplate,
    (id) => `/api/notebook/templates/notes/${id}`,
    (version) => ({ version, name: 'Updated' }),
  ),
  'DELETE /api/notebook/templates/notes/{id}': onEntity(
    noteTemplate,
    (id) => `/api/notebook/templates/notes/${id}`,
  ),

  'POST /api/notebook/tasks': create('/api/notebook/tasks', () => ({
    id: ulid(),
    area: 'work',
    title: 'Created',
  })),
  'GET /api/notebook/tasks/{id}': onEntity(
    task,
    (id) => `/api/notebook/tasks/${id}`,
    () => undefined,
  ),
  'PUT /api/notebook/tasks/{id}': onEntity(
    task,
    (id) => `/api/notebook/tasks/${id}`,
    (version) => ({ version, title: 'Updated' }),
  ),
  'DELETE /api/notebook/tasks/{id}': onEntity(
    task,
    (id) => `/api/notebook/tasks/${id}`,
  ),
  'POST /api/notebook/tasks/{id}/complete': onEntity(
    task,
    (id) => `/api/notebook/tasks/${id}/complete`,
  ),
  'POST /api/notebook/tasks/{id}/reopen': onEntity(
    completedTask,
    (id) => `/api/notebook/tasks/${id}/reopen`,
  ),
};

function methodOf(key: string): string {
  return key.slice(0, key.indexOf(' '));
}

async function observe(key: string): Promise<Advertised> {
  const method = methodOf(key);
  const probe = PROBES[key]!;

  const plain = await probe();
  const res = await call(method, plain.path, { body: plain.body });
  expect(
    res.status >= 200 && res.status < 300,
    `${key} without If-Match: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBe(true);
  if (res.etag !== undefined) {
    expect(res.etag, `${key} ETag`).toBe(`"${String(res.body.version)}"`);
  }

  // Body `version` is right, header is stale: only a handler that reads
  // `If-Match` (and lets it win) answers 412.
  const stale = await probe();
  const staleRes = await call(method, stale.path, {
    body: stale.body,
    ifMatch: `"${stale.version + 7}"`,
  });
  expect(
    [200, 201, 412],
    `${key} with stale If-Match: ${staleRes.status} ${JSON.stringify(staleRes.body)}`,
  ).toContain(staleRes.status);
  if (staleRes.status === 412) {
    expect(staleRes.body.error).toBe('precondition_failed');
    expect(staleRes.body.currentVersion).toBe(stale.version);
  }

  return { etag: res.etag !== undefined, ifMatch: staleRes.status === 412 };
}

describe('OpenAPI ETag / If-Match match handler behaviour (DynamoDB Local)', () => {
  const advertised = advertisedByOperation();
  it('probes every operation that advertises ETag or If-Match', () => {
    const unprobed = [...advertised]
      .filter(([key, a]) => (a.etag || a.ifMatch) && !(key in PROBES))
      .map(([key]) => key);
    expect(unprobed).toEqual([]);
  });

  it('probes only operations that exist in the spec, at paths the spec matches', async () => {
    for (const key of Object.keys(PROBES)) {
      expect(advertised.has(key), `${key} in OpenAPI`).toBe(true);
      const target = await PROBES[key]!();
      const specPath = key.slice(key.indexOf(' ') + 1);
      expect(target.path, `${key} probe path`).toMatch(
        openApiPathPattern(specPath),
      );
    }
  });

  it('advertises Notebook concurrency headers (guards the probe itself)', () => {
    expect(advertised.get('PUT /api/notebook/notes/{id}')).toEqual({
      etag: true,
      ifMatch: true,
    });
  });

  it.each(Object.keys(PROBES))(
    '%s returns ETag and enforces If-Match exactly as advertised',
    async (key) => {
      expect(await observe(key)).toEqual(advertised.get(key));
    },
  );
});
