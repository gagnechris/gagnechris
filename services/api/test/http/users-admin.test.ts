import { describe, expect, it } from 'vitest';
import {
  USER_EMAIL_MAX_LENGTH,
  USER_NAME_MAX_LENGTH,
} from '@gagnechris/shared';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import type { ManagedUser } from '@gagnechris/shared';
import { idToken, siteAdmin, userAdmin } from './support/claims.js';
import { useApi } from './support/harness.js';

const OWNER = 'owner';
const LOCAL_ADMIN = 'local-dev-user';

type Res = { status: number; body: Record<string, unknown> };

describe('users and access', () => {
  // The directory lives in the server, so rows and users persist across tests.
  const h = useApi('users-admin', {
    env: { USER_DIRECTORY: 'memory' },
    truncate: false,
  });

  async function call(
    method: string,
    path: string,
    body?: unknown,
    claims = userAdmin(OWNER),
  ): Promise<Res> {
    const res = await h.api.request(method, `/api${path}`, { body, claims });
    return {
      status: res.status,
      body: (res.body ?? {}) as Record<string, unknown>,
    };
  }

  const user = (res: Res) => res.body.user as ManagedUser;

  async function invite(email: string, level = 'cms', name?: string) {
    const res = await call('POST', '/admin/users', { email, level, name });
    expect(res.status).toBe(200);
    return user(res);
  }

  const stale = (sub = OWNER) =>
    userAdmin(sub, {
      auth_time: String(Math.floor(Date.now() / 1000) - 301),
    });

  it('invites with the level’s groups, trimmed and lowercased', async () => {
    const res = await call('POST', '/admin/users', {
      email: '  Ada@Example.com ',
      name: '  Ada  ',
      level: 'full',
      extra: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        email: 'ada@example.com',
        name: 'Ada',
        level: 'full',
        status: 'invited',
        createdAt: expect.stringMatching(/Z$/),
      },
      restored: false,
    });
    expect(
      user(
        await call('POST', '/admin/users', {
          email: 'noname@example.com',
          name: ' ',
          level: 'notebook',
        }),
      ),
    ).toMatchObject({ name: null, level: 'notebook' });

    expect(
      await call('POST', '/admin/users', {
        email: 'ADA@example.com',
        level: 'cms',
      }),
    ).toEqual({
      status: 409,
      body: {
        error: 'user_exists',
        message: 'Someone with this email already has an account.',
      },
    });
  });

  it('lists everyone by email with their level and status', async () => {
    const res = await call('GET', '/admin/users');
    expect(res.status).toBe(200);
    const users = res.body.users as ManagedUser[];
    expect(users.map((u) => u.email)).toEqual(
      [...users.map((u) => u.email)].sort((a, b) => a.localeCompare(b)),
    );
    expect(users.find((u) => u.id === LOCAL_ADMIN)).toEqual({
      id: LOCAL_ADMIN,
      email: 'local@gagnechris.com',
      name: 'Local Admin',
      level: 'full',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it.each([
    [{}, { email: 'invalid_type', level: 'invalid_value' }],
    [
      {
        email: 'not-an-email',
        name: 'x'.repeat(USER_NAME_MAX_LENGTH + 1),
        level: 'owner',
      },
      { email: 'invalid_format', name: 'too_big', level: 'invalid_value' },
    ],
    [
      {
        email: `${'a'.repeat(USER_EMAIL_MAX_LENGTH - '@x.io'.length + 1)}@x.io`,
        level: 'cms',
      },
      { email: 'too_big' },
    ],
  ])('rejects the invite %j', async (body, fields) => {
    expect(await call('POST', '/admin/users', body)).toEqual({
      status: 400,
      body: { error: 'bad_request', message: 'Invalid request body', fields },
    });
  });

  it('changes access, signing out only when it drops a group', async () => {
    const reader = await invite('reader@example.com', 'notebook');
    const path = `/admin/users/${reader.id}/access`;
    expect(user(await call('PUT', path, { level: 'full' }))).toMatchObject({
      level: 'full',
    });
    expect(user(await call('PUT', path, { level: 'cms' }))).toMatchObject({
      level: 'cms',
    });

    expect(await call('PUT', path, { level: 'owner' })).toMatchObject({
      status: 400,
      body: {
        message: 'Invalid request body',
        fields: { level: 'invalid_value' },
      },
    });
    expect(
      await call('PUT', '/admin/users/bad_id/access', { level: 'cms' }),
    ).toMatchObject({
      status: 400,
      body: {
        message: 'Invalid path parameters',
        fields: { id: 'invalid_format' },
      },
    });
    expect(
      await call('PUT', '/admin/users/nobody/access', { level: 'cms' }),
    ).toEqual({
      status: 404,
      body: { error: 'not_found', message: 'User not found' },
    });
  });

  it('nobody changes their own access', async () => {
    for (const [method, path, body] of [
      ['PUT', `/admin/users/${OWNER}/access`, { level: 'cms' }],
      ['POST', `/admin/users/${OWNER}/disable`, undefined],
      ['POST', `/admin/users/${OWNER}/sign-out`, undefined],
      ['POST', `/admin/users/${OWNER}/remove`, undefined],
    ] as const) {
      expect(await call(method, path, body)).toEqual({
        status: 409,
        body: {
          error: 'self_change',
          message: "You can't change, disable or remove your own access.",
        },
      });
    }
  });

  it('keeps one enabled Full Admin', async () => {
    const full = await invite('second-full@example.com', 'full');
    expect((await call('POST', `/admin/users/${full.id}/disable`)).status).toBe(
      200,
    );

    // Every other Full Admin is now disabled except the local one.
    const others = (
      (await call('GET', '/admin/users')).body.users as ManagedUser[]
    ).filter(
      (u) =>
        u.level === 'full' && u.status !== 'disabled' && u.id !== LOCAL_ADMIN,
    );
    for (const u of others) {
      await call('POST', `/admin/users/${u.id}/disable`);
    }
    const last = {
      status: 409,
      body: {
        error: 'last_full_admin',
        message: 'There must always be at least one Full Admin.',
      },
    };
    expect(
      await call('PUT', `/admin/users/${LOCAL_ADMIN}/access`, { level: 'cms' }),
    ).toEqual(last);
    expect(await call('POST', `/admin/users/${LOCAL_ADMIN}/disable`)).toEqual(
      last,
    );
    expect(await call('POST', `/admin/users/${LOCAL_ADMIN}/remove`)).toEqual(
      last,
    );

    const enabled = await call('POST', `/admin/users/${full.id}/enable`);
    expect(user(enabled)).toMatchObject({ level: 'full', status: 'invited' });
    expect(
      user(
        await call('PUT', `/admin/users/${LOCAL_ADMIN}/access`, {
          level: 'full',
        }),
      ),
    ).toMatchObject({ level: 'full' });
  });

  it('removes and restores, keeping the previous level', async () => {
    const editor = await invite('editor@example.com', 'cms');
    const base = `/admin/users/${editor.id}`;
    const removed = await call('POST', `${base}/remove`);
    expect(user(removed)).toMatchObject({ status: 'removed', level: 'cms' });
    expect(user(await call('POST', `${base}/remove`))).toMatchObject({
      status: 'removed',
      level: 'cms',
    });

    const blocked = {
      status: 409,
      body: {
        error: 'user_removed',
        message: 'This user was removed. Restore them first.',
      },
    };
    expect(await call('PUT', `${base}/access`, { level: 'full' })).toEqual(
      blocked,
    );
    expect(await call('POST', `${base}/enable`)).toEqual(blocked);
    expect(await call('POST', `${base}/resend-invite`)).toEqual(blocked);

    expect(user(await call('POST', `${base}/restore`, {}))).toMatchObject({
      status: 'invited',
      level: 'cms',
    });
    expect(await call('POST', `${base}/restore`, {})).toEqual({
      status: 409,
      body: { error: 'not_removed', message: 'This user was not removed.' },
    });

    await call('POST', `${base}/remove`);
    expect(
      user(await call('POST', `${base}/restore`, { level: 'notebook' })),
    ).toMatchObject({ level: 'notebook' });
    expect(
      await call('POST', `${base}/restore`, { level: 'owner' }),
    ).toMatchObject({
      status: 400,
      body: { fields: { level: 'invalid_value' } },
    });

    await call('POST', `${base}/remove`);
    const again = await call('POST', '/admin/users', {
      email: 'editor@example.com',
      level: 'full',
    });
    expect(again.body).toMatchObject({
      user: { id: editor.id, level: 'full', status: 'invited' },
      restored: true,
    });
  });

  it('restoring someone removed with no access asks for a level', async () => {
    const bare = await invite('bare@example.com', 'notebook');
    const base = `/admin/users/${bare.id}`;
    // Removal leaves no groups, so removing again without the first record
    // has no level to keep.
    await call('POST', `${base}/remove`);
    await h.doc.send(
      new DeleteCommand({
        TableName: h.tableName,
        Key: keys.removedUser(bare.id),
      }),
    );
    expect(user(await call('POST', `${base}/remove`))).toMatchObject({
      status: 'removed',
      level: null,
    });
    expect(await call('POST', `${base}/restore`, {})).toEqual({
      status: 400,
      body: {
        error: 'bad_request',
        message: 'Choose an access level to restore.',
      },
    });
  });

  it('resends an invite only before the first sign-in', async () => {
    const fresh = await invite('fresh@example.com');
    expect(
      user(await call('POST', `/admin/users/${fresh.id}/resend-invite`)),
    ).toMatchObject({ status: 'invited' });
    expect(
      await call('POST', `/admin/users/${LOCAL_ADMIN}/resend-invite`),
    ).toEqual({
      status: 409,
      body: {
        error: 'not_invited',
        message: 'This user has already signed in.',
      },
    });
    expect(
      user(await call('POST', `/admin/users/${LOCAL_ADMIN}/sign-out`)),
    ).toMatchObject({ status: 'active' });
  });

  it('access changes need a recent sign-in; reads, invites and resends do not', async () => {
    const target = await invite('reauth@example.com');
    const reauth = {
      status: 403,
      body: {
        error: 'reauth_required',
        message: 'Confirm it’s you to change someone’s access.',
      },
    };
    for (const claims of [stale(), userAdmin(OWNER, { auth_time: 'soon' })]) {
      for (const [method, path, body] of [
        ['PUT', `/admin/users/${target.id}/access`, { level: 'full' }],
        ['POST', `/admin/users/${target.id}/disable`, undefined],
        ['POST', `/admin/users/${target.id}/enable`, undefined],
        ['POST', `/admin/users/${target.id}/sign-out`, undefined],
        ['POST', `/admin/users/${target.id}/remove`, undefined],
        ['POST', `/admin/users/${target.id}/restore`, {}],
      ] as const) {
        expect(await call(method, path, body, claims)).toEqual(reauth);
      }
    }
    expect((await call('GET', '/admin/users', undefined, stale())).status).toBe(
      200,
    );
    expect(
      (
        await call(
          'POST',
          '/admin/users',
          { email: 'late@example.com', level: 'cms' },
          stale(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          'POST',
          `/admin/users/${target.id}/resend-invite`,
          undefined,
          stale(),
        )
      ).status,
    ).toBe(200);
  });

  it('needs the user-admin group, from the admin web or iOS client', async () => {
    const forbidden = {
      status: 403,
      body: { error: 'forbidden', message: 'Requires the user-admin group' },
    };
    expect(await call('GET', '/admin/users', undefined, siteAdmin())).toEqual(
      forbidden,
    );
    expect(
      await call(
        'GET',
        '/admin/users',
        undefined,
        idToken('ios-admin', 'ios', ['site-admin', 'notebook']),
      ),
    ).toEqual(forbidden);
    expect(
      (
        await call(
          'GET',
          '/admin/users',
          undefined,
          idToken(OWNER, 'ios', ['user-admin']),
        )
      ).status,
    ).toBe(200);
  });
});

describe('users without a user pool', () => {
  const h = useApi('users-unconfigured', { truncate: false });

  it('answers 503', async () => {
    const res = await h.api.request('GET', '/api/admin/users', {
      claims: userAdmin(OWNER),
    });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: 'service_unavailable',
      message: 'User management is not configured',
    });
  });
});
