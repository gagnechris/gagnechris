import { describe, expect, it } from 'vitest';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Claims } from './support/api.js';
import { clientId, idToken } from './support/claims.js';
import { apiCalls } from './support/call.js';
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
const { call } = apiCalls(h);

describe('per-prefix authorization (DynamoDB Local)', () => {
  async function rowKeys(): Promise<string[]> {
    const out = await h.doc.send(new ScanCommand({ TableName: h.tableName }));
    return (out.Items ?? []).map((item) => `${item.pk} ${item.sk}`).sort();
  }

  async function writeNotebookData(claims: Claims) {
    const note = await call('POST', '/api/notebook/notes', {
      claims,
      body: {
        id: NOTE_ID,
        area: 'work',
        type: 'page',
        title: 'Private',
        bodyMarkdown: 'notebook secret',
      },
    });
    const task = await call('POST', '/api/notebook/tasks', {
      claims,
      body: {
        id: TASK_ID,
        area: 'work',
        title: 'Private task',
      },
    });
    return [note.status, task.status];
  }

  async function writeSiteContent(claims: Claims) {
    const post = await call('POST', '/api/admin/posts', {
      claims,
      body: {
        title: 'Public post',
      },
    });
    const home = await call('GET', '/api/admin/home', { claims });
    const homeUpdate = await call('PUT', '/api/admin/home', {
      claims,
      body: {
        version: home.body.version,
        title: 'Edited',
      },
    });
    return { post, home, homeUpdate };
  }

  it('notebook-only: reads and writes Notebook data, cannot touch site content', async () => {
    expect(await writeNotebookData(notebookOnly)).toEqual([201, 201]);
    const list = await call('GET', '/api/notebook/notes', {
      claims: notebookOnly,
    });
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(
      (
        await call('POST', '/api/notebook/search', {
          claims: notebookOnly,
          body: {
            q: 'secret',
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call('GET', '/api/notebook/sync/changes', {
          claims: notebookOnly,
        })
      ).status,
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
      const result = await call(method, path, {
        claims: notebookOnly,
        body,
      });
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
        await call('POST', '/api/admin/home/publish', {
          claims: siteAdminOnly,
          body: {
            version: homeUpdate.body.version,
          },
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
      const result = await call(method, path, {
        claims: siteAdminOnly,
        body,
      });
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
      const result = await call(method, path, { claims, body });
      expect(
        result.status,
        `${claims.aud} ${claims['cognito:groups']} ${method} ${path}`,
      ).toBe(403);
      expect(JSON.stringify(result.body)).not.toContain('secret');
    }
    expect(await rowKeys()).toEqual(before);
  });

  it('iOS client: each group opens its own space and nothing else', async () => {
    const iosNotebook = token(clientId('ios'), '[notebook]');
    expect(await writeNotebookData(iosNotebook)).toEqual([201, 201]);
    const list = await call('GET', '/api/notebook/notes', {
      claims: iosNotebook,
    });
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const before = await rowKeys();
    const denied = await writeSiteContent(iosNotebook);
    expect([
      denied.post.status,
      denied.home.status,
      denied.homeUpdate.status,
    ]).toEqual([403, 403, 403]);
    const iosSiteAdmin = token(clientId('ios'), '[site-admin]');
    expect(
      (await call('GET', '/api/notebook/notes', { claims: iosSiteAdmin }))
        .status,
    ).toBe(403);
    expect(
      (await call('GET', '/api/admin/users', { claims: iosSiteAdmin })).status,
    ).toBe(403);
    expect(await rowKeys()).toEqual(before);

    const { post, home, homeUpdate } = await writeSiteContent(iosSiteAdmin);
    expect([post.status, home.status, homeUpdate.status]).toEqual([
      201, 200, 200,
    ]);
  });

  it('web client + admin group reads and writes nothing, even with AUTH_LEGACY_WEB_CLIENT_ID set', async () => {
    const legacy = token(LEGACY_CLIENT, '[admin]');
    const before = await rowKeys();
    expect(await writeNotebookData(legacy)).toEqual([403, 403]);
    const { post, home, homeUpdate } = await writeSiteContent(legacy);
    expect([post.status, home.status, homeUpdate.status]).toEqual([
      403, 403, 403,
    ]);
    expect(
      (await call('GET', '/api/notebook/notes', { claims: legacy })).status,
    ).toBe(403);
    expect(
      (await call('GET', '/api/admin/posts', { claims: legacy })).status,
    ).toBe(403);
    expect(await rowKeys()).toEqual(before);
  });

  it('GET /api/admin/me returns the site admin claims and refuses other tokens', async () => {
    const me = await call('GET', '/api/admin/me', { claims: siteAdminOnly });
    expect(me).toEqual({
      status: 200,
      body: { sub: SUB, email: `${SUB}@example.com`, username: SUB },
    });
    const {
      email: _email,
      'cognito:username': _username,
      ...withoutProfile
    } = siteAdminOnly;
    const bare = await call('GET', '/api/admin/me', {
      claims: { ...withoutProfile, username: 'plain' },
    });
    expect(bare).toEqual({
      status: 200,
      body: { sub: SUB, username: 'plain' },
    });
    expect(
      (await call('GET', '/api/admin/me', { claims: notebookOnly })).status,
    ).toBe(403);
  });
});
