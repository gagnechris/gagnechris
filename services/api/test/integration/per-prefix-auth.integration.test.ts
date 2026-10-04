import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { HomeRepository } from '../../src/home/repository.js';
import { createHomeRoutes } from '../../src/home/handlers.js';
import { createNoteRoutes } from '../../src/notes/handlers.js';
import { NotesRepository } from '../../src/notes/repository.js';
import { createPostRoutes } from '../../src/posts/handlers.js';
import { PostsRepository } from '../../src/posts/repository.js';
import { createResumeRoutes } from '../../src/resume/handlers.js';
import { ResumeRepository } from '../../src/resume/repository.js';
import { dispatchRoutes, type RouteDef } from '../../src/router.js';
import { createSearchRoutes } from '../../src/search/handlers.js';
import { registerProductionSyncAdapters } from '../../src/sync/adapters.js';
import { createSyncRoutes } from '../../src/sync/handlers.js';
import { SyncLedger } from '../../src/sync/ledger.js';
import { clearSyncEntities } from '../../src/sync/registry.js';
import { createTaskRoutes } from '../../src/tasks/handlers.js';
import { TasksRepository } from '../../src/tasks/repository.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../support/dynamo-local.js';
import { makeEvent } from '../support/make-event.js';

// One person, one sub: only the token's app client and groups differ, so
// owner scoping can't be what stops a request.
const SUB = 'user-per-prefix';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5JA1';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5JA2';
const LEGACY_CLIENT = 'test-legacy-web';

const token = (aud: string, groups: string) => ({
  sub: SUB,
  token_use: 'id',
  aud,
  'cognito:groups': groups,
});
const notebookOnly = token(process.env.NOTEBOOK_WEB_CLIENT_ID!, '[notebook]');
const siteAdminOnly = token(process.env.ADMIN_WEB_CLIENT_ID!, '[site-admin]');

describe('per-prefix authorization (DynamoDB Local)', () => {
  let tableName: string;
  let routes: RouteDef[];
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('per-prefix-auth');
  });

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  beforeEach(async () => {
    await truncateTable(doc, tableName);
    clearSyncEntities();
    registerProductionSyncAdapters();
    const notes = new NotesRepository(doc, tableName);
    const tasks = new TasksRepository(doc, tableName);
    routes = [
      ...createPostRoutes(new PostsRepository(doc, tableName)),
      ...createHomeRoutes(new HomeRepository(doc, tableName)),
      ...createResumeRoutes(new ResumeRepository(doc, tableName)),
      ...createNoteRoutes(notes),
      ...createTaskRoutes(tasks, notes),
      ...createSearchRoutes({ notes, tasks }),
      ...createSyncRoutes(new SyncLedger(doc, tableName)),
    ];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function call(
    claims: Record<string, string>,
    method: string,
    path: string,
    body?: unknown,
  ) {
    const res = await dispatchRoutes(
      routes,
      makeEvent(method, path, { body, jwtClaims: claims, appToken: false }),
      method,
      path,
    );
    return {
      status: res.statusCode,
      body: JSON.parse(res.body as string) as Record<string, unknown>,
    };
  }

  async function rowKeys(): Promise<string[]> {
    const out = await doc.send(new ScanCommand({ TableName: tableName }));
    return (out.Items ?? []).map((item) => `${item.pk} ${item.sk}`).sort();
  }

  async function writeNotebookData(claims: Record<string, string>) {
    const note = await call(claims, 'POST', '/api/notebook/notes', {
      id: NOTE_ID,
      area: 'work',
      type: 'page',
      title: 'Private',
      bodyMarkdown: 'notebook secret',
    });
    const task = await call(claims, 'POST', '/api/notebook/tasks', {
      id: TASK_ID,
      area: 'work',
      title: 'Private task',
    });
    return [note.status, task.status];
  }

  async function writeSiteContent(claims: Record<string, string>) {
    const post = await call(claims, 'POST', '/api/admin/posts', {
      title: 'Public post',
    });
    const home = await call(claims, 'GET', '/api/admin/home');
    const homeUpdate = await call(claims, 'PUT', '/api/admin/home', {
      version: home.body.version,
      title: 'Edited',
    });
    return { post, home, homeUpdate };
  }

  it('notebook-only: reads and writes Notebook data, cannot touch site content', async () => {
    expect(await writeNotebookData(notebookOnly)).toEqual([201, 201]);
    const list = await call(notebookOnly, 'GET', '/api/notebook/notes');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(
      (
        await call(notebookOnly, 'POST', '/api/notebook/search', {
          q: 'secret',
        })
      ).status,
    ).toBe(200);
    expect(
      (await call(notebookOnly, 'GET', '/api/notebook/sync/changes')).status,
    ).toBe(200);

    const before = await rowKeys();
    const attempts = [
      ['GET', '/api/admin/posts'],
      ['POST', '/api/admin/posts', { title: 'Defaced' }],
      ['GET', '/api/admin/home'],
      ['PUT', '/api/admin/home', { version: 0, title: 'Defaced' }],
      ['POST', '/api/admin/home/publish', { version: 0 }],
      ['PUT', '/api/admin/resume', { version: 0 }],
      ['POST', '/api/admin/resume/publish', { version: 0 }],
    ] as const;
    for (const [method, path, body] of attempts) {
      const result = await call(notebookOnly, method, path, body);
      expect(result.status, `${method} ${path}`).toBe(403);
      expect(result.body.error).toBe('forbidden');
    }
    expect(await rowKeys()).toEqual(before);
  });

  it('site-admin-only: edits site content, cannot read or write Notebook data', async () => {
    expect(await writeNotebookData(notebookOnly)).toEqual([201, 201]);

    const { post, home, homeUpdate } = await writeSiteContent(siteAdminOnly);
    expect([post.status, home.status, homeUpdate.status]).toEqual([
      201, 200, 200,
    ]);
    expect(
      (
        await call(siteAdminOnly, 'POST', '/api/admin/home/publish', {
          version: homeUpdate.body.version,
        })
      ).status,
    ).toBe(200);

    const before = await rowKeys();
    const attempts = [
      ['GET', '/api/notebook/notes'],
      ['GET', `/api/notebook/notes/${NOTE_ID}`],
      ['GET', '/api/notebook/tasks'],
      ['GET', `/api/notebook/tasks/${TASK_ID}`],
      ['POST', '/api/notebook/search', { q: 'secret' }],
      ['GET', '/api/notebook/sync/changes'],
      ['PUT', `/api/notebook/notes/${NOTE_ID}`, { version: 1, title: 'x' }],
      ['DELETE', `/api/notebook/notes/${NOTE_ID}`, { version: 1 }],
      [
        'POST',
        '/api/notebook/notes',
        {
          id: '01ARZ3NDEKTSV4RRFFQ69G5JA3',
          area: 'work',
          type: 'page',
          title: 'x',
          bodyMarkdown: '',
        },
      ],
    ] as const;
    for (const [method, path, body] of attempts) {
      const result = await call(siteAdminOnly, method, path, body);
      expect(result.status, `${method} ${path}`).toBe(403);
      expect(JSON.stringify(result.body)).not.toContain('secret');
      expect(JSON.stringify(result.body)).not.toContain('Private');
    }
    expect(await rowKeys()).toEqual(before);
  });

  it('each check holds alone: both groups on the wrong client, or the right client without the group', async () => {
    expect(await writeNotebookData(notebookOnly)).toEqual([201, 201]);
    const before = await rowKeys();
    const bothGroups = '[site-admin notebook]';
    const cases = [
      [
        token(process.env.NOTEBOOK_WEB_CLIENT_ID!, bothGroups),
        'POST',
        '/api/admin/posts',
        { title: 'x' },
      ],
      [
        token(process.env.ADMIN_WEB_CLIENT_ID!, '[notebook]'),
        'POST',
        '/api/admin/posts',
        { title: 'x' },
      ],
      [
        token(process.env.ADMIN_WEB_CLIENT_ID!, bothGroups),
        'GET',
        '/api/notebook/notes',
      ],
      [
        token(process.env.NOTEBOOK_WEB_CLIENT_ID!, '[site-admin]'),
        'GET',
        '/api/notebook/notes',
      ],
    ] as const;
    for (const [claims, method, path, body] of cases) {
      const result = await call(claims, method, path, body);
      expect(
        result.status,
        `${claims.aud} ${claims['cognito:groups']} ${method} ${path}`,
      ).toBe(403);
      expect(JSON.stringify(result.body)).not.toContain('secret');
    }
    expect(await rowKeys()).toEqual(before);
  });

  it('web client + admin group reads and writes nothing, even with AUTH_LEGACY_WEB_CLIENT_ID set', async () => {
    const legacy = token(LEGACY_CLIENT, '[admin]');
    vi.stubEnv('AUTH_LEGACY_WEB_CLIENT_ID', LEGACY_CLIENT);
    const before = await rowKeys();
    expect(await writeNotebookData(legacy)).toEqual([403, 403]);
    const { post, home, homeUpdate } = await writeSiteContent(legacy);
    expect([post.status, home.status, homeUpdate.status]).toEqual([
      403, 403, 403,
    ]);
    expect((await call(legacy, 'GET', '/api/notebook/notes')).status).toBe(403);
    expect((await call(legacy, 'GET', '/api/admin/posts')).status).toBe(403);
    expect(await rowKeys()).toEqual(before);
  });
});
