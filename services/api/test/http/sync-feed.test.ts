import { describe, expect, it } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  ownerSyncCreateClaimPk,
  syncCreateClaimSk,
  SYNC_CREATE_CLAIM_TTL_DAYS,
  SYNC_TOMBSTONE_TTL_DAYS,
  ttlDaysFromNow,
} from '@gagnechris/data';
import { notebookUser } from './support/claims.js';
import { useApi } from './support/harness.js';

const USER = 'user-sync-it';
const NOTE_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const NOTE_ID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FB0';

type Change = {
  type: string;
  id: string;
  version: number;
  deleted: boolean;
  entity?: Record<string, unknown>;
};

const h = useApi('sync-feed');

async function ok(
  method: string,
  path: string,
  opts: { body?: unknown; query?: Record<string, string> } = {},
) {
  const res = await h.api.request(method, path, {
    ...opts,
    claims: notebookUser(USER),
  });
  expect(
    res.status >= 200 && res.status < 300,
    `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`,
  ).toBe(true);
  return res.body;
}

const createNote = (id: string, title: string) =>
  ok('POST', '/api/notebook/notes', {
    body: { id, area: 'work', type: 'page', title },
  });

describe('sync feed (DynamoDB Local)', () => {
  it('returns changes via sparse GSI3 with watermark + tombstone', async () => {
    await createNote(NOTE_ID, 'local-a');
    await createNote(NOTE_ID_2, 'local-b');
    await ok('DELETE', `/api/notebook/notes/${NOTE_ID}`, {
      body: { version: 1 },
    });

    const before = new Date().toISOString();
    const feed = (await ok('GET', '/api/notebook/sync/changes')) as {
      changes: Change[];
      nextSince: string;
    };
    const after = new Date().toISOString();
    expect(feed.changes).toHaveLength(2);
    expect(feed.nextSince >= before && feed.nextSince <= after).toBe(true);

    const byId = Object.fromEntries(feed.changes.map((c) => [c.id, c]));
    expect(byId[NOTE_ID]).toMatchObject({
      type: 'note',
      version: 2,
      deleted: true,
    });
    expect(byId[NOTE_ID]!.entity).toBeUndefined();
    expect(byId[NOTE_ID_2]).toMatchObject({
      type: 'note',
      deleted: false,
      version: 1,
    });
    expect(byId[NOTE_ID_2]!.entity).toMatchObject({ title: 'local-b' });
  });

  it('stale since answers 410 resync_required', async () => {
    const stale = new Date(
      Date.now() - (SYNC_TOMBSTONE_TTL_DAYS + 2) * 86_400_000,
    ).toISOString();
    const res = await h.api.request('GET', '/api/notebook/sync/changes', {
      claims: notebookUser(USER),
      query: { since: stale },
    });
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ error: 'resync_required' });
  });

  it('delete extends create-claim TTL from delete time', async () => {
    const claimKey = {
      pk: ownerSyncCreateClaimPk(USER, 'note', NOTE_ID),
      sk: syncCreateClaimSk(),
    };
    const readTtl = async () =>
      (
        await h.doc.send(
          new GetCommand({
            TableName: h.tableName,
            Key: claimKey,
            ConsistentRead: true,
          }),
        )
      ).Item?.ttl as number | undefined;

    const createFrom = new Date();
    await createNote(NOTE_ID, 'claim-ttl');
    const createTo = new Date();
    const before = await readTtl();
    expect(before).toBeGreaterThanOrEqual(
      ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, createFrom),
    );
    expect(before).toBeLessThanOrEqual(
      ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, createTo),
    );

    // The TTL has one-second resolution; let the delete land in a later second.
    await new Promise((r) => setTimeout(r, 1_100));

    const deleteFrom = new Date();
    await ok('DELETE', `/api/notebook/notes/${NOTE_ID}`, {
      body: { version: 1 },
    });
    const deleteTo = new Date();
    const after = await readTtl();
    expect(after).toBeGreaterThanOrEqual(
      ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, deleteFrom),
    );
    expect(after).toBeLessThanOrEqual(
      ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, deleteTo),
    );
    expect(after).toBeGreaterThan(before!);
  });
});
