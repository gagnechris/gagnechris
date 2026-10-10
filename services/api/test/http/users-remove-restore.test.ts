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
