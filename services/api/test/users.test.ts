import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RemovedUserItem } from '@gagnechris/data';
import { ACCESS_GROUPS, type ManagedUser } from '@gagnechris/shared';
import type { DirectoryUser } from '../src/users/directory.js';
import { createUserRoutes } from '../src/users/handlers.js';
import { MemoryUserDirectory } from '../src/users/memory-directory.js';
import { routes } from '../src/routes.js';
import { dispatchRoutes } from '../src/router.js';
import { makeEvent } from './support/make-event.js';

class MemoryRemovedUsers {
  readonly items = new Map<string, RemovedUserItem>();

  async list() {
    return [...this.items.values()];
  }

  async get(userId: string) {
    return this.items.get(userId) ?? null;
  }

  async put(
    input: Omit<RemovedUserItem, 'pk' | 'sk' | 'entityType' | 'createdAt'>,
  ) {
    const item: RemovedUserItem = {
      ...input,
      pk: 'REMOVED_USERS',
      sk: `USER#${input.userId}`,
      entityType: 'removedUser',
      createdAt: '2026-10-06T00:00:00.000Z',
    };
    this.items.set(input.userId, item);
    return item;
  }

  async delete(userId: string) {
    this.items.delete(userId);
  }
}

const user = (
  id: string,
  groups: readonly string[],
  extra: Partial<DirectoryUser> = {},
): DirectoryUser => ({
  id,
  email: `${id}@example.com`,
  name: null,
  enabled: true,
  status: 'CONFIRMED',
  createdAt: '2026-01-01T00:00:00.000Z',
  groups: [...groups],
  ...extra,
});

let directory: MemoryUserDirectory;
let removed: MemoryRemovedUsers;

beforeEach(() => {
  directory = new MemoryUserDirectory([
    user('owner', ACCESS_GROUPS),
    user('second', ACCESS_GROUPS),
    user('writer', ['site-admin']),
    user('reader', ['notebook']),
  ]);
  removed = new MemoryRemovedUsers();
});

async function call(
  method: string,
  path: string,
  body?: unknown,
  actor = 'owner',
  claims: Record<string, string> = {},
) {
  const result = await dispatchRoutes(
    createUserRoutes({ directory, removed }),
    makeEvent(method, `/api${path}`, {
      jwtClaims: { sub: actor, ...claims },
      body,
    }),
    method,
    `/api${path}`,
  );
  return {
    status: result.statusCode,
    body: JSON.parse(result.body as string) as {
      user?: ManagedUser;
      users?: ManagedUser[];
      restored?: boolean;
      error?: string;
    },
  };
}

const groupsOf = async (id: string) =>
  (await directory.getUser(id))!.groups.sort();

describe('GET /api/admin/users', () => {
  it('lists users with the level their groups give and their status', async () => {
    await directory.disableUser('reader');
    const { status, body } = await call('GET', '/admin/users');
    expect(status).toBe(200);
    expect(body.users!.map((u) => [u.id, u.level, u.status])).toEqual([
      ['owner', 'full', 'active'],
      ['reader', 'notebook', 'disabled'],
      ['second', 'full', 'active'],
      ['writer', 'cms', 'active'],
    ]);
  });

  it('a site-admin-only caller gets 403', async () => {
    const result = await dispatchRoutes(
      createUserRoutes({ directory, removed }),
      makeEvent('GET', '/api/admin/users', {
        jwtClaims: { sub: 'writer', 'cognito:groups': '[site-admin]' },
      }),
      'GET',
      '/api/admin/users',
    );
    expect(result.statusCode).toBe(403);
  });
});

describe('POST /api/admin/users (invite)', () => {
  it('creates the user, sends the invite and adds the level’s groups', async () => {
    const { status, body } = await call('POST', '/admin/users', {
      email: '  New@Example.com ',
      name: 'New Person',
      level: 'cms',
    });
    expect(status).toBe(200);
    expect(body.restored).toBe(false);
    expect(body.user).toMatchObject({
      email: 'new@example.com',
      name: 'New Person',
      level: 'cms',
      status: 'invited',
    });
    expect(directory.invitesSent).toEqual(['new@example.com']);
    expect(await groupsOf(body.user!.id)).toEqual(['site-admin']);
  });

  it('an email that already has an account → 409 user_exists', async () => {
    const { status, body } = await call('POST', '/admin/users', {
      email: 'writer@example.com',
      level: 'notebook',
    });
    expect(status).toBe(409);
    expect(body.error).toBe('user_exists');
  });

  it('re-inviting a removed user restores the same account (same sub, so the same Notebook)', async () => {
    expect((await call('POST', '/admin/users/reader/remove')).status).toBe(200);
    const { status, body } = await call('POST', '/admin/users', {
      email: 'reader@example.com',
      level: 'full',
    });
    expect(status).toBe(200);
    expect(body.restored).toBe(true);
    expect(body.user).toMatchObject({
      id: 'reader',
      level: 'full',
      status: 'active',
    });
    expect(directory.invitesSent).toEqual([]);
    expect(removed.items.size).toBe(0);
  });
});

describe('PUT /api/admin/users/:id/access', () => {
  it('raising access adds groups without signing the user out', async () => {
    const { status, body } = await call('PUT', '/admin/users/reader/access', {
      level: 'full',
    });
    expect(status).toBe(200);
    expect(body.user!.level).toBe('full');
    expect(await groupsOf('reader')).toEqual([...ACCESS_GROUPS].sort());
    expect(directory.signedOut).toEqual([]);
  });

  it('lowering access removes groups and signs the user out everywhere', async () => {
    const { status } = await call('PUT', '/admin/users/second/access', {
      level: 'notebook',
    });
    expect(status).toBe(200);
    expect(await groupsOf('second')).toEqual(['notebook']);
    expect(directory.signedOut).toEqual(['second']);
  });

  it('switching between CMS and Notebook only also signs out', async () => {
    await call('PUT', '/admin/users/writer/access', { level: 'notebook' });
    expect(await groupsOf('writer')).toEqual(['notebook']);
    expect(directory.signedOut).toEqual(['writer']);
  });

  it('an unknown level → 400; an unknown user → 404', async () => {
    expect(
      (await call('PUT', '/admin/users/reader/access', { level: 'admin' }))
        .status,
    ).toBe(400);
    expect(
      (await call('PUT', '/admin/users/nobody/access', { level: 'cms' }))
        .status,
    ).toBe(404);
  });
});

describe('guards', () => {
  it.each([
    ['PUT', '/admin/users/owner/access', { level: 'cms' }],
    ['POST', '/admin/users/owner/disable', undefined],
    ['POST', '/admin/users/owner/remove', undefined],
  ] as const)(
    'the caller can’t %s their own account (%s)',
    async (method, path, body) => {
      const result = await call(method, path, body);
      expect(result.status).toBe(409);
      expect(result.body.error).toBe('self_change');
      expect(await groupsOf('owner')).toEqual([...ACCESS_GROUPS].sort());
      expect((await directory.getUser('owner'))!.enabled).toBe(true);
    },
  );

  describe('with one other Full Admin', () => {
    beforeEach(async () => {
      await call('PUT', '/admin/users/second/access', { level: 'cms' });
    });

    it.each([
      ['PUT', '/admin/users/owner/access', { level: 'cms' }],
      ['POST', '/admin/users/owner/disable', undefined],
      ['POST', '/admin/users/owner/remove', undefined],
    ] as const)(
      'lowering, disabling or removing the last Full Admin → 409 (%s %s)',
      async (method, path, body) => {
        const result = await call(method, path, body, 'second');
        expect(result.status).toBe(409);
        expect(result.body.error).toBe('last_full_admin');
        expect(await groupsOf('owner')).toEqual([...ACCESS_GROUPS].sort());
        expect((await directory.getUser('owner'))!.enabled).toBe(true);
        expect(removed.items.size).toBe(0);
      },
    );

    it('a disabled Full Admin doesn’t count', async () => {
      await call('PUT', '/admin/users/second/access', { level: 'full' });
      await call('POST', '/admin/users/second/disable');
      const result = await call(
        'PUT',
        '/admin/users/owner/access',
        { level: 'cms' },
        'second',
      );
      expect(result.body.error).toBe('last_full_admin');
    });
  });

  it('with two Full Admins, one can lower the other', async () => {
    expect(
      (await call('PUT', '/admin/users/second/access', { level: 'cms' }))
        .status,
    ).toBe(200);
  });
});

describe('disable, enable, remove, restore', () => {
  it('disable and enable keep the groups', async () => {
    const disabled = await call('POST', '/admin/users/writer/disable');
    expect(disabled.body.user).toMatchObject({
      status: 'disabled',
      level: 'cms',
    });
    expect(directory.signedOut).toEqual(['writer']);
    const enabled = await call('POST', '/admin/users/writer/enable');
    expect(enabled.body.user).toMatchObject({ status: 'active', level: 'cms' });
  });

  it('remove drops every group, disables sign-in and keeps the account', async () => {
    const { status, body } = await call('POST', '/admin/users/second/remove');
    expect(status).toBe(200);
    expect(body.user).toMatchObject({
      id: 'second',
      status: 'removed',
      level: 'full',
    });
    const kept = await directory.getUser('second');
    expect(kept).toMatchObject({ enabled: false, groups: [] });
    expect(directory.signedOut).toEqual(['second']);
    expect(removed.items.get('second')).toMatchObject({
      previousLevel: 'full',
      removedBy: 'owner',
    });
  });

  it('remove is safe to retry and keeps the first previous level', async () => {
    await call('POST', '/admin/users/writer/remove');
    const again = await call('POST', '/admin/users/writer/remove');
    expect(again.status).toBe(200);
    expect(again.body.user!.level).toBe('cms');
  });

  it('a removed user only changes through restore', async () => {
    await call('POST', '/admin/users/writer/remove');
    for (const [method, path, body] of [
      ['PUT', '/admin/users/writer/access', { level: 'full' }],
      ['POST', '/admin/users/writer/enable', undefined],
      ['POST', '/admin/users/writer/disable', undefined],
      ['POST', '/admin/users/writer/resend-invite', undefined],
    ] as const) {
      const result = await call(method, path, body);
      expect(result.body.error, `${method} ${path}`).toBe('user_removed');
    }
  });

  it('restore brings back the previous level, or the one asked for', async () => {
    await call('POST', '/admin/users/writer/remove');
    const back = await call('POST', '/admin/users/writer/restore');
    expect(back.body.user).toMatchObject({ status: 'active', level: 'cms' });
    expect(await groupsOf('writer')).toEqual(['site-admin']);

    await call('POST', '/admin/users/writer/remove');
    const raised = await call('POST', '/admin/users/writer/restore', {
      level: 'notebook',
    });
    expect(raised.body.user!.level).toBe('notebook');
  });

  it('restoring someone who wasn’t removed → 409 not_removed', async () => {
    const result = await call('POST', '/admin/users/writer/restore');
    expect(result.body.error).toBe('not_removed');
  });
});

describe('sign out everywhere', () => {
  it('signs another user out, never yourself', async () => {
    const { status } = await call('POST', '/admin/users/writer/sign-out');
    expect(status).toBe(200);
    expect(directory.signedOut).toEqual(['writer']);
    const self = await call('POST', '/admin/users/owner/sign-out');
    expect(self.body.error).toBe('self_change');
  });
});

describe('resend invite', () => {
  it('resends only while the user hasn’t signed in', async () => {
    const invited = await call('POST', '/admin/users', {
      email: 'pending@example.com',
      level: 'notebook',
    });
    const id = invited.body.user!.id;
    expect(
      (await call('POST', `/admin/users/${id}/resend-invite`)).status,
    ).toBe(200);
    expect(directory.invitesSent).toEqual([
      'pending@example.com',
      'pending@example.com',
    ]);
    const signedIn = await call('POST', '/admin/users/writer/resend-invite');
    expect(signedIn.body.error).toBe('not_invited');
  });
});

describe('recent sign-in', () => {
  const signedInAgo = (seconds: number) => ({
    auth_time: String(Math.floor(Date.now() / 1000) - seconds),
  });

  it.each([
    ['PUT', '/admin/users/writer/access', { level: 'notebook' }],
    ['POST', '/admin/users/writer/disable', undefined],
    ['POST', '/admin/users/writer/enable', undefined],
    ['POST', '/admin/users/writer/sign-out', undefined],
    ['POST', '/admin/users/writer/remove', undefined],
    ['POST', '/admin/users/writer/restore', {}],
  ])(
    '%s %s needs a sign-in in the last 5 minutes',
    async (method, path, body) => {
      const stale = await call(method, path, body, 'owner', signedInAgo(301));
      expect(stale).toEqual({
        status: 403,
        body: { error: 'reauth_required', message: expect.any(String) },
      });
      const missing = await call(method, path, body, 'owner', {
        auth_time: '',
      });
      expect(missing.status).toBe(403);
      expect(await groupsOf('writer')).toEqual(['site-admin']);
      expect((await directory.getUser('writer'))!.enabled).toBe(true);
      expect(directory.signedOut).toEqual([]);

      const fresh = await call(method, path, body, 'owner', signedInAgo(60));
      expect(fresh.status).not.toBe(403);
    },
  );

  it('listing, inviting and resending an invite do not', async () => {
    const old = signedInAgo(3600);
    expect(
      (await call('GET', '/admin/users', undefined, 'owner', old)).status,
    ).toBe(200);
    const invited = await call(
      'POST',
      '/admin/users',
      { email: 'new@example.com', level: 'notebook' },
      'owner',
      old,
    );
    expect(invited.status).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/admin/users/${invited.body.user!.id}/resend-invite`,
          undefined,
          'owner',
          old,
        )
      ).status,
    ).toBe(200);
  });
});

describe('no data deletion', () => {
  it('no users route deletes anything', () => {
    const userRoutes = routes.filter((r) =>
      r.pattern.startsWith('/admin/users'),
    );
    expect(userRoutes.length).toBe(9);
    expect(userRoutes.some((r) => r.method === 'DELETE')).toBe(false);
  });

  it('the users module never calls a Cognito or DynamoDB user delete', () => {
    const dir = join(import.meta.dirname, '../src/users');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/AdminDeleteUser|DeleteUserCommand/);
      expect(source, file).not.toMatch(/notePk|taskPk|NOTE#|TASK#/);
    }
  });
});
