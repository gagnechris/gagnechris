import { describe, expect, it } from 'vitest';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from '@gagnechris/data';
import { notebookUser, userAdmin } from './support/claims.js';
import { useApi } from './support/harness.js';

const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5W01';
const OWNER = 'owner';

const h = useApi('users', { env: { USER_DIRECTORY: 'memory' } });

async function asOwner(method: string, path: string, body?: unknown) {
  const res = await h.api.request(method, path, {
    body,
    claims: userAdmin(OWNER),
  });
  return {
    status: res.status,
    body: (res.body ?? {}) as Record<string, unknown>,
  };
}

async function listed(id: string) {
  const res = await asOwner('GET', '/api/admin/users');
  return (res.body.users as Array<{ id: string }>).find((u) => u.id === id);
}

describe('removing and re-inviting a user keeps their Notebook', () => {
  it('the same email comes back as the same sub with the same notes', async () => {
    const invited = await asOwner('POST', '/api/admin/users', {
      email: 'friend@example.com',
      level: 'notebook',
    });
    const friend = (invited.body.user as { id: string }).id;

    expect(
      (
        await h.api.request('POST', '/api/notebook/notes', {
          claims: notebookUser(friend),
          body: {
            id: NOTE_ID,
            area: 'personal',
            type: 'page',
            title: 'Kept',
          },
        })
      ).status,
    ).toBe(201);

    const removed = await asOwner('POST', `/api/admin/users/${friend}/remove`);
    expect(removed.body.user).toMatchObject({
      status: 'removed',
      level: 'notebook',
    });

    // The directory is only visible through the API, which reports a removed
    // user's previous level; without the removal record it shows the
    // directory's own state: sign-in disabled, no groups left.
    const key = keys.removedUser(friend);
    const record = await h.doc.send(
      new GetCommand({ TableName: h.tableName, Key: key }),
    );
    expect(record.Item).toBeDefined();
    await h.doc.send(new DeleteCommand({ TableName: h.tableName, Key: key }));
    expect(await listed(friend)).toMatchObject({
      status: 'disabled',
      level: null,
    });
    await h.doc.send(
      new PutCommand({ TableName: h.tableName, Item: record.Item }),
    );

    const list = await asOwner('GET', '/api/admin/users');
    expect(list.body.users).toContainEqual(
      expect.objectContaining({ id: friend, status: 'removed' }),
    );

    const again = await asOwner('POST', '/api/admin/users', {
      email: 'friend@example.com',
      level: 'notebook',
    });
    expect(again.body).toMatchObject({
      restored: true,
      user: { id: friend, status: 'invited', level: 'notebook' },
    });

    const notes = await h.api.request('GET', '/api/notebook/notes', {
      claims: notebookUser(friend),
    });
    expect(notes.body.items).toContainEqual(
      expect.objectContaining({ id: NOTE_ID, title: 'Kept' }),
    );
  });
});

describe('ending access refuses the tokens a user already holds', () => {
  const seconds = (offset: number) =>
    String(Math.floor(Date.now() / 1000) + offset);
  const before = { iat: seconds(-60), auth_time: seconds(-60) };
  const revoked = {
    status: 401,
    body: { error: 'unauthorized', message: 'Session ended; sign in again' },
  };

  async function inviteAs(email: string, level: string) {
    const res = await asOwner('POST', '/api/admin/users', { email, level });
    return (res.body.user as { id: string }).id;
  }

  const notes = (claims: ReturnType<typeof notebookUser>) =>
    h.api
      .request('GET', '/api/notebook/notes', { claims })
      .then((res) => ({ status: res.status, body: res.body }));

  it('a removed user is refused until they sign in again after a restore', async () => {
    const id = await inviteAs('gone@example.com', 'notebook');
    const held = notebookUser(id, before);
    expect((await notes(held)).status).toBe(200);

    expect(
      (await asOwner('POST', `/api/admin/users/${id}/remove`)).status,
    ).toBe(200);
    expect(await notes(held)).toEqual(revoked);

    expect(
      (await asOwner('POST', `/api/admin/users/${id}/restore`, {})).status,
    ).toBe(200);
    expect(await notes(held)).toEqual(revoked);
    const fresh = notebookUser(id, { iat: seconds(1), auth_time: seconds(1) });
    expect((await notes(fresh)).status).toBe(200);
  });

  it.each([
    ['disable', 'POST', 'disable', undefined],
    ['sign-out', 'POST', 'sign-out', undefined],
    ['lowered access', 'PUT', 'access', { level: 'cms' }],
  ] as const)('%s refuses held tokens', async (_, method, action, body) => {
    const id = await inviteAs(`ended-${action}@example.com`, 'full');
    const held = notebookUser(id, before);
    expect((await notes(held)).status).toBe(200);
    expect(
      (await asOwner(method, `/api/admin/users/${id}/${action}`, body)).status,
    ).toBe(200);
    expect(await notes(held)).toEqual(revoked);
  });

  it('raising access keeps held tokens', async () => {
    const id = await inviteAs('raised@example.com', 'notebook');
    const held = notebookUser(id, before);
    expect(
      (
        await asOwner('PUT', `/api/admin/users/${id}/access`, {
          level: 'full',
        })
      ).status,
    ).toBe(200);
    expect((await notes(held)).status).toBe(200);
  });

  it('refuses a held token with no issue time once access ended', async () => {
    const id = await inviteAs('no-iat@example.com', 'notebook');
    expect(
      (await asOwner('POST', `/api/admin/users/${id}/sign-out`)).status,
    ).toBe(200);
    expect(await notes(notebookUser(id, { auth_time: '' }))).toEqual(revoked);
  });
});
