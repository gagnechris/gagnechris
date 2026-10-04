// For every operation the spec says returns `ETag` or accepts `If-Match`,
// drive the real route table against DynamoDB Local and check the handler
// does exactly that; the probed routes must also not do it unadvertised.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';
import { buildOpenApiDocument } from '@gagnechris/shared/openapi';
import { setDocClient } from '../../src/data/client.js';
import { dispatchRoutes, routePatternToOpenApiPath } from '../../src/router.js';
import { routes } from '../../src/routes.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
} from '../support/dynamo-local.js';
import { makeEvent } from '../support/make-event.js';

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

type Response = {
  status: number;
  etag: string | undefined;
  body: Record<string, unknown>;
};

async function call(
  method: string,
  path: string,
  body?: unknown,
  ifMatch?: string,
): Promise<Response> {
  const res = await dispatchRoutes(
    routes,
    makeEvent(method, path, {
      body,
      headers: ifMatch ? { 'if-match': ifMatch } : undefined,
      jwtClaims: { sub: USER },
    }),
    method,
    path,
  );
  const headers = (res.headers ?? {}) as Record<string, string>;
  const etagKey = Object.keys(headers).find((h) => h.toLowerCase() === 'etag');
  return {
    status: res.statusCode ?? 0,
    etag: etagKey ? headers[etagKey] : undefined,
    body: res.body ? (JSON.parse(res.body as string) as never) : {},
  };
}

async function ok(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ id: string; version: number }> {
  const res = await call(method, path, body);
  expect(
    res.status >= 200 && res.status < 300,
    `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBe(true);
  return res.body as { id: string; version: number };
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
  return ok('POST', '/api/admin/posts', { title: `Post ${unique()}` });
}
async function publishedPost() {
  const p = await post();
  return ok('POST', `/api/admin/posts/${p.id}/publish`, versionBody(p.version));
}
async function editedPublishedPost() {
  const p = await publishedPost();
  return ok('PUT', `/api/admin/posts/${p.id}`, {
    version: p.version,
    excerpt: `edit ${unique()}`,
  });
}

async function project() {
  return ok('POST', '/api/admin/projects', { name: `Project ${unique()}` });
}
async function publishedProject() {
  const p = await project();
  return ok(
    'POST',
    `/api/admin/projects/${p.id}/publish`,
    versionBody(p.version),
  );
}
async function editedPublishedProject() {
  const p = await publishedProject();
  return ok('PUT', `/api/admin/projects/${p.id}`, {
    version: p.version,
    pitch: `edit ${unique()}`,
  });
}

async function singleton(base: string) {
  return ok('GET', base);
}
async function publishedSingleton(base: string) {
  const s = await singleton(base);
  return ok('POST', `${base}/publish`, versionBody(s.version));
}
async function editedPublishedSingleton(base: string, edit: object) {
  const s = await publishedSingleton(base);
  return ok('PUT', base, { version: s.version, ...edit });
}

async function note() {
  return ok('POST', '/api/notebook/notes', {
    id: ulid(),
    area: 'work',
    type: 'page',
    title: `Note ${unique()}`,
  });
}
async function dailyNote() {
  const date = nextDate();
  const n = await ok('PUT', `/api/notebook/notes/daily/work/${date}`, {
    id: ulid(),
    title: 'Daily',
  });
  return { ...n, date };
}

async function task() {
  return ok('POST', '/api/notebook/tasks', {
    id: ulid(),
    area: 'work',
    title: `Task ${unique()}`,
  });
}
async function completedTask() {
  const t = await task();
  return ok(
    'POST',
    `/api/notebook/tasks/${t.id}/complete`,
    versionBody(t.version),
  );
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
    body: ((version: number) => unknown) | undefined = versionBody,
  ) =>
  async (): Promise<Target> => {
    const e = await setup();
    return { path, version: e.version, body: body?.(e.version) };
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
  'PUT /api/notebook/notes/daily/{area}/{date}': async () => {
    const n = await dailyNote();
    return {
      path: `/api/notebook/notes/daily/work/${n.date}`,
      version: n.version,
      body: { id: n.id, version: n.version, title: 'Updated' },
    };
  },

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
  const res = await call(method, plain.path, plain.body);
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
  const staleRes = await call(
    method,
    stale.path,
    stale.body,
    `"${stale.version + 7}"`,
  );
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
  let tableName: string;
  let previousTable: string | undefined;

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('http-concurrency');
    previousTable = process.env.DATA_TABLE_NAME;
    process.env.DATA_TABLE_NAME = tableName;
    setDocClient(createLocalDocClient());
  });

  afterAll(async () => {
    setDocClient(undefined);
    if (previousTable === undefined) delete process.env.DATA_TABLE_NAME;
    else process.env.DATA_TABLE_NAME = previousTable;
    await deleteIntegrationTable(tableName);
  });

  it('probes every operation that advertises ETag or If-Match', () => {
    const unprobed = [...advertised]
      .filter(([key, a]) => (a.etag || a.ifMatch) && !(key in PROBES))
      .map(([key]) => key);
    expect(unprobed).toEqual([]);
  });

  it('probes only operations that exist in the spec and the route table', () => {
    const routeKeys = new Set(
      routes.map((r) => `${r.method} ${routePatternToOpenApiPath(r.pattern)}`),
    );
    for (const key of Object.keys(PROBES)) {
      expect(advertised.has(key), `${key} in OpenAPI`).toBe(true);
      expect(routeKeys.has(key), `${key} in routes`).toBe(true);
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
