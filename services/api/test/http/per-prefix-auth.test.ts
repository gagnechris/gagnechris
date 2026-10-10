import { describe, expect, it } from 'vitest';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Claims } from './support/api.js';
import { clientId, idToken } from './support/claims.js';
import { useApi } from './support/harness.js';

// One person, one sub: only the token's app client and groups differ, so
// owner scoping can't be what stops a request.
const SUB = 'user-per-prefix';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5JA1';
const TASK_ID = '01ARZ3NDEKTSV4RRFFQ69G5JA2';
const LEGACY_CLIENT = 'test-legacy-web';

const token = (aud: string, groups: string): Claims =>
  idToken(SUB, 'notebook', [], { aud, 'cognito:groups': groups });
const notebookOnly = token(clientId('notebook'), '[notebook]');
const siteAdminOnly = token(clientId('admin'), '[site-admin]');

const h = useApi('per-prefix-auth', {
  env: { AUTH_LEGACY_WEB_CLIENT_ID: LEGACY_CLIENT },
});

describe('per-prefix authorization (DynamoDB Local)', () => {
  async function call(
    claims: Claims,
    method: string,
    path: string,
    body?: unknown,
  ) {
    const res = await h.api.request(method, path, { claims, body });
    return {
      status: res.status,
      body: (res.body ?? {}) as Record<string, unknown>,
    };
  }

  async function rowKeys(): Promise<string[]> {
    const out = await h.doc.send(new ScanCommand({ TableName: h.tableName }));
    return (out.Items ?? []).map((item) => `${item.pk} ${item.sk}`).sort();
  }

  async function writeNotebookData(claims: Claims) {
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

  async function writeSiteContent(claims: Claims) {
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
        token(clientId('notebook'), bothGroups),
        'POST',
        '/api/admin/posts',
        { title: 'x' },
      ],
      [
        token(clientId('admin'), '[notebook]'),
        'POST',
        '/api/admin/posts',
        { title: 'x' },
      ],
      [token(clientId('admin'), bothGroups), 'GET', '/api/notebook/notes'],
      [
        token(clientId('notebook'), '[site-admin]'),
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

  it('iOS client: notebook group reads and writes Notebook data, no group opens site content', async () => {
    const iosNotebook = token(clientId('ios'), '[notebook]');
    expect(await writeNotebookData(iosNotebook)).toEqual([201, 201]);
    const list = await call(iosNotebook, 'GET', '/api/notebook/notes');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const before = await rowKeys();
    const iosAll = token(clientId('ios'), '[site-admin notebook user-admin]');
    for (const claims of [iosNotebook, iosAll]) {
      const { post, home, homeUpdate } = await writeSiteContent(claims);
      expect([post.status, home.status, homeUpdate.status]).toEqual([
        403, 403, 403,
      ]);
    }
    const noGroup = token(clientId('ios'), '[site-admin]');
    expect((await call(noGroup, 'GET', '/api/notebook/notes')).status).toBe(
      403,
    );
    expect(await rowKeys()).toEqual(before);
  });

  it('web client + admin group reads and writes nothing, even with AUTH_LEGACY_WEB_CLIENT_ID set', async () => {
    const legacy = token(LEGACY_CLIENT, '[admin]');
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
