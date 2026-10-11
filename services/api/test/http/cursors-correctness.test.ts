import { describe, expect, it } from 'vitest';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER_A = 'user-cursor-a';
const USER_B = 'user-cursor-b';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOTE_ID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FB0';

const INVALID_CURSOR = {
  error: 'bad_request',
  message: 'Invalid pagination cursor',
};

const h = useApi('cursors-correctness');

function sync(user: string, query: Record<string, string>) {
  return h.api.request('GET', '/api/notebook/sync/changes', {
    claims: notebookUser(user),
    query,
  });
}

async function createNote(user: string, id: string, title: string) {
  const res = await h.api.request('POST', '/api/notebook/notes', {
    claims: notebookUser(user),
    body: { id, area: 'work', type: 'page', title },
  });
  expect(res.status).toBe(201);
}

describe('cursor correctness (DynamoDB Local)', () => {
  it('rejects other-user and changed-since sync cursors (400)', async () => {
    await createNote(USER_A, NOTE_ID, 'a1');
    await createNote(USER_A, NOTE_ID_2, 'a2');

    const page1 = await sync(USER_A, { limit: '1' });
    expect(page1.status).toBe(200);
    expect(page1.body.nextCursor).toBeTruthy();

    const otherUser = await sync(USER_B, {
      cursor: page1.body.nextCursor,
      limit: '1',
    });
    expect(otherUser.status).toBe(400);
    expect(otherUser.body).toMatchObject(INVALID_CURSOR);

    // Reusing a cursor under a tighter `since` that excludes the LEK sort key.
    const changedSince = await sync(USER_A, {
      since: new Date().toISOString(),
      cursor: page1.body.nextCursor,
      limit: '1',
    });
    expect(changedSince.status).toBe(400);
    expect(changedSince.body).toMatchObject(INVALID_CURSOR);
  });
});
