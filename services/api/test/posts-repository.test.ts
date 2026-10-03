import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PostsRepository } from '../src/posts/repository.js';
import {
  buildMetaItem,
  buildPublishedItem,
  postMetaSk,
  postPk,
  postPublishedSk,
} from '@gagnechris/data';
import type { Post } from '@gagnechris/shared';
import { encodeCursor } from '../src/data/cursor.js';
import { mockDocClient } from './support/mock-doc.js';

const draft: Post = {
  id: '01TESTPOSTID00000000000000',
  slug: 'hello',
  title: 'Hello',
  excerpt: '',
  bodyMarkdown: 'body',
  tags: [],
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-09-27T01:00:00.000Z',
  coverImage: null,
  seo: null,
  version: 1,
  hasUnpublishedChanges: false,
};

function batchGetResponses(...items: Record<string, unknown>[]) {
  return {
    Responses: {
      'gagnechris-test': items,
    },
  };
}

describe('PostsRepository', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'gagnechris-test';
  });

  it('creates a draft with slug claim + META in one transaction', async () => {
    const send = vi.fn(async (_command: unknown) => ({}));
    const doc = { send } as unknown as DynamoDBDocumentClient;
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const post = await repo.create({
      title: 'Hello World',
      excerpt: '',
      bodyMarkdown: '',
      tags: [],
    });
    expect(post.status).toBe('draft');
    expect(post.slug).toBe('hello-world');
    expect(post.version).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0]![0] as {
      input: { TransactItems: unknown[] };
    };
    expect(cmd.input.TransactItems).toHaveLength(2);
  });

  it('gets by id from META item via BatchGet', async () => {
    const doc = mockDocClient(async (command) => {
      if (command.constructor.name === 'BatchGetCommand') {
        return batchGetResponses(buildMetaItem(draft));
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const got = await repo.getById(draft.id);
    expect(got?.slug).toBe('hello');
  });

  it('gets by slug via slug claim then META', async () => {
    let calls = 0;
    const doc = mockDocClient(async (command) => {
      calls += 1;
      if (command.constructor.name === 'GetCommand') {
        return { Item: { postId: draft.id } };
      }
      if (command.constructor.name === 'BatchGetCommand') {
        return batchGetResponses(buildMetaItem(draft));
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const got = await repo.getBySlug('hello');
    expect(got?.id).toBe(draft.id);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('lists via gsi1 status partition', async () => {
    const doc = mockDocClient(async () => ({ Items: [buildMetaItem(draft)] }));
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const page = await repo.list('draft');
    expect(page.items).toHaveLength(1);
  });

  it('list returns nextCursor from LastEvaluatedKey', async () => {
    const lek = {
      pk: postPk(draft.id),
      sk: postMetaSk(),
      gsi1pk: 'STATUS#draft',
      gsi1sk: 'x',
    };
    const doc = mockDocClient(async () => ({
      Items: [buildMetaItem(draft)],
      LastEvaluatedKey: lek,
    }));
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const page = await repo.list('draft', { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe(encodeCursor(lek));
  });

  it('publish flips status and bumps version', async () => {
    let calls = 0;
    const doc = mockDocClient(async (command) => {
      calls += 1;
      if (command.constructor.name === 'BatchGetCommand') {
        return batchGetResponses(buildMetaItem(draft));
      }
      if (command.constructor.name === 'GetCommand') {
        return {};
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const published = await repo.publish(draft.id, draft.version);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeTruthy();
    expect(published.version).toBe(2);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('publish accepts an explicit publishedAt for migrations', async () => {
    const doc = mockDocClient(async (command) => {
      if (command.constructor.name === 'BatchGetCommand') {
        return batchGetResponses(buildMetaItem(draft));
      }
      if (command.constructor.name === 'GetCommand') {
        return {};
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const published = await repo.publish(draft.id, draft.version, {
      publishedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(published.publishedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('update of a published post does not write PUBLISHED (draft isolation)', async () => {
    const published: Post = {
      ...draft,
      status: 'published',
      publishedAt: '2026-02-01T00:00:00.000Z',
      version: 2,
    };
    const live = { ...published, title: 'Live title' };
    const send = vi.fn(
      async (command: {
        constructor: { name: string };
        input: Record<string, unknown>;
      }) => {
        if (command.constructor.name === 'BatchGetCommand') {
          return batchGetResponses(
            buildMetaItem(published),
            buildPublishedItem(live),
          );
        }
        if (command.constructor.name === 'GetCommand') {
          const key = command.input.Key as { sk?: string };
          if (key.sk === postPublishedSk()) {
            return { Item: buildPublishedItem(live) };
          }
          return { Item: buildMetaItem(published) };
        }
        return {};
      },
    );
    const doc = { send } as unknown as DynamoDBDocumentClient;
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const next = await repo.update(published.id, {
      version: 2,
      title: 'Draft title',
    });
    expect(next.title).toBe('Draft title');
    expect(next.hasUnpublishedChanges).toBe(true);
    const tx = send.mock.calls.find(
      (c) =>
        (c[0] as { constructor: { name: string } }).constructor.name ===
        'TransactWriteCommand',
    )![0] as {
      input: { TransactItems: Array<Record<string, unknown>> };
    };
    const sks = tx.input.TransactItems.flatMap((item) => {
      const put = item.Put as { Item?: { sk?: string } } | undefined;
      return put?.Item?.sk ? [put.Item.sk] : [];
    });
    expect(sks).toEqual(['META']);
  });

  it('publish writes PUBLISHED snapshot and clears unpublished flag', async () => {
    const published: Post = {
      ...draft,
      status: 'published',
      publishedAt: '2026-02-01T00:00:00.000Z',
      title: 'Draft title',
      version: 3,
    };
    const live: Post = {
      ...published,
      title: 'Live title',
      version: 2,
    };
    const send = vi.fn(
      async (command: {
        constructor: { name: string };
        input: Record<string, unknown>;
      }) => {
        if (command.constructor.name === 'BatchGetCommand') {
          return batchGetResponses(
            buildMetaItem(published),
            buildPublishedItem(live),
          );
        }
        if (command.constructor.name === 'GetCommand') {
          const key = command.input.Key as { sk?: string };
          if (key.sk === postPublishedSk()) {
            return { Item: buildPublishedItem(live) };
          }
          return { Item: buildMetaItem(published) };
        }
        return {};
      },
    );
    const doc = { send } as unknown as DynamoDBDocumentClient;
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const next = await repo.publish(published.id, published.version);
    expect(next.title).toBe('Draft title');
    expect(next.hasUnpublishedChanges).toBe(false);
    const tx = send.mock.calls.find(
      (c) =>
        (c[0] as { constructor: { name: string } }).constructor.name ===
        'TransactWriteCommand',
    )![0] as {
      input: { TransactItems: Array<Record<string, unknown>> };
    };
    const sks = tx.input.TransactItems.flatMap((item) => {
      const put = item.Put as { Item?: { sk?: string } } | undefined;
      return put?.Item?.sk ? [put.Item.sk] : [];
    });
    expect(sks.sort()).toEqual(['META', 'PUBLISHED']);
  });

  it('multi-status list pages published then draft with no drops/duplicates', async () => {
    const draftA = buildMetaItem(draft);
    const publishedPost: Post = {
      ...draft,
      id: '01TESTPOSTID00000000000001',
      slug: 'published-one',
      status: 'published',
      publishedAt: '2026-09-27T02:00:00.000Z',
      version: 2,
    };
    const pubMeta = buildMetaItem(publishedPost);
    let draftCalls = 0;
    let publishedCalls = 0;
    const doc = mockDocClient(async (command) => {
      if (command.constructor.name !== 'QueryCommand') {
        if (command.constructor.name === 'BatchGetCommand') {
          return { Responses: { 'gagnechris-test': [] } };
        }
        return {};
      }
      const pk = (
        command as { input: { ExpressionAttributeValues: { ':pk': string } } }
      ).input.ExpressionAttributeValues[':pk'];
      if (pk === 'STATUS#draft') {
        draftCalls += 1;
        if (draftCalls === 1) {
          return {
            Items: [draftA],
            LastEvaluatedKey: {
              pk: postPk(draft.id),
              sk: postMetaSk(),
              gsi1pk: 'STATUS#draft',
              gsi1sk: 'x',
            },
          };
        }
        return { Items: [] };
      }
      if (pk === 'STATUS#published') {
        publishedCalls += 1;
        if (publishedCalls === 1) {
          return {
            Items: [pubMeta],
            LastEvaluatedKey: {
              pk: postPk(publishedPost.id),
              sk: postMetaSk(),
              gsi1pk: 'STATUS#published',
              gsi1sk: 'y',
            },
          };
        }
        return { Items: [] };
      }
      return { Items: [] };
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const first = await repo.list(undefined, { limit: 1 });
    expect(first.items.map((p) => p.id)).toEqual([publishedPost.id]);
    expect(first.nextCursor).toBeTruthy();

    const second = await repo.list(undefined, {
      cursor: first.nextCursor,
      limit: 1,
    });
    expect(second.items.map((p) => p.id)).toEqual([draft.id]);
    expect(second.nextCursor).toBeTruthy();

    const third = await repo.list(undefined, {
      cursor: second.nextCursor,
      limit: 1,
    });
    expect(third.items).toEqual([]);
    expect(third.nextCursor).toBeUndefined();

    const allIds = [...first.items, ...second.items, ...third.items].map(
      (p) => p.id,
    );
    expect(allIds).toEqual([publishedPost.id, draft.id]);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(publishedCalls).toBe(2);
    expect(draftCalls).toBe(2);
  });

  it('rejects a tampered GSI cursor with SyntaxError (400)', async () => {
    const repo = new PostsRepository(
      mockDocClient(async () => ({ Items: [] })),
      'gagnechris-test',
    );
    const bad = encodeCursor({ pk: 'POST#1', sk: 'META' }); // missing gsi1 keys
    await expect(repo.list('draft', { cursor: bad })).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });

  it('list does not flag unpublished when META is published but snapshot is missing', async () => {
    const publishedMeta: Post = {
      ...draft,
      status: 'published',
      publishedAt: '2026-09-27T02:00:00.000Z',
      version: 2,
    };
    const doc = mockDocClient(async (command) => {
      if (command.constructor.name === 'QueryCommand') {
        return { Items: [buildMetaItem(publishedMeta)] };
      }
      if (command.constructor.name === 'BatchGetCommand') {
        // No PUBLISHED snapshot — stale META after unpublish must not look dirty.
        return { Responses: { 'gagnechris-test': [] } };
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const page = await repo.list('published');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.status).toBe('published');
    expect(page.items[0]!.hasUnpublishedChanges).toBe(false);
  });

  it('skips corrupt items in list instead of failing', async () => {
    const doc = mockDocClient(async () => ({
      Items: [
        { entityType: 'post', sk: 'META', pk: 'POST#bad' }, // invalid
        buildMetaItem(draft),
      ],
    }));
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const page = await repo.list('draft');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.slug).toBe('hello');
  });

  it('race-path update conflict includes currentVersion/current', async () => {
    const { TransactionCanceledException } =
      await import('@aws-sdk/client-dynamodb');
    let batch = 0;
    const doc = mockDocClient(async (command) => {
      if (command.constructor.name === 'BatchGetCommand') {
        batch += 1;
        return {
          Responses: {
            'gagnechris-test': [
              buildMetaItem({ ...draft, version: batch === 1 ? 1 : 3 }),
            ],
          },
        };
      }
      if (command.constructor.name === 'TransactWriteCommand') {
        throw new TransactionCanceledException({
          message: 'cancelled',
          $metadata: {},
          CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
        });
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    await expect(
      repo.update(draft.id, { version: 1, title: 'Nope' }),
    ).rejects.toMatchObject({
      name: 'ConflictError',
      currentVersion: 3,
      code: 'version_conflict',
    });
  });

  it('slug claim cancellation maps to slug_taken', async () => {
    const { TransactionCanceledException } =
      await import('@aws-sdk/client-dynamodb');
    const doc = mockDocClient(async (command) => {
      if (command.constructor.name === 'TransactWriteCommand') {
        throw new TransactionCanceledException({
          message: 'cancelled',
          $metadata: {},
          CancellationReasons: [
            { Code: 'ConditionalCheckFailed' },
            { Code: 'None' },
          ],
        });
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    await expect(
      repo.create({ title: 'Taken', excerpt: '', bodyMarkdown: '', tags: [] }),
    ).rejects.toMatchObject({
      name: 'ConflictError',
      code: 'slug_taken',
    });
  });
});

describe('PostsRepository cursor + published integrity', () => {
  it('rejects non-string pk in GSI cursor', async () => {
    const repo = new PostsRepository(
      mockDocClient(async () => ({ Items: [] })),
      'gagnechris-test',
    );
    const bad = Buffer.from(
      JSON.stringify({
        pk: 1,
        sk: 'META',
        gsi1pk: 'STATUS#draft',
        gsi1sk: 'x',
      }),
      'utf8',
    ).toString('base64url');
    await expect(repo.list('draft', { cursor: bad })).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });

  it('rejects gsi1pk from another status partition', async () => {
    const repo = new PostsRepository(
      mockDocClient(async () => ({ Items: [] })),
      'gagnechris-test',
    );
    const bad = encodeCursor({
      pk: 'POST#1',
      sk: 'META',
      gsi1pk: 'STATUS#published',
      gsi1sk: 'x',
    });
    await expect(repo.list('draft', { cursor: bad })).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });

  it('rejects cursor with extra keys', async () => {
    const repo = new PostsRepository(
      mockDocClient(async () => ({ Items: [] })),
      'gagnechris-test',
    );
    const bad = encodeCursor({
      pk: 'POST#1',
      sk: 'META',
      gsi1pk: 'STATUS#draft',
      gsi1sk: 'x',
      extra: 'nope',
    });
    await expect(repo.list('draft', { cursor: bad })).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });

  it('rejects multi-status lek from the wrong status', async () => {
    const repo = new PostsRepository(
      mockDocClient(async () => ({ Items: [] })),
      'gagnechris-test',
    );
    // Admin "all" lists published then draft; i:0 must be STATUS#published.
    const bad = encodeCursor({
      i: 0,
      lek: {
        pk: 'POST#1',
        sk: 'META',
        gsi1pk: 'STATUS#draft',
        gsi1sk: 'x',
      },
    } as unknown as Record<string, unknown>);
    await expect(repo.list(undefined, { cursor: bad })).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });

  it('corrupt PUBLISHED row returns DataIntegrityError via getById', async () => {
    const doc = mockDocClient(async (command) => {
      if (command.constructor.name === 'BatchGetCommand') {
        return {
          Responses: {
            'gagnechris-test': [
              buildMetaItem(draft),
              {
                pk: postPk(draft.id),
                sk: postPublishedSk(),
                entityType: 'post',
                // missing required fields → parse fails
              },
            ],
          },
        };
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const { DataIntegrityError } = await import('../src/data/errors.js');
    await expect(repo.getById(draft.id)).rejects.toBeInstanceOf(
      DataIntegrityError,
    );
  });
});
