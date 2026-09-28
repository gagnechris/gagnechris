import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PostsRepository } from '../src/posts/repository.js';
import {
  buildMetaItem,
  buildPublishedItem,
  postMetaSk,
  postPk,
  postPublishedSk,
} from '../src/posts/keys.js';
import type { Post } from '@gagnechris/shared';
import { encodeCursor } from '../src/data/cursor.js';

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

function mockDoc(
  impl: (command: {
    constructor: { name: string };
    input: unknown;
  }) => Promise<unknown>,
): DynamoDBDocumentClient {
  return {
    send: vi.fn(async (command: {
      constructor: { name: string };
      input: unknown;
    }) => impl(command)),
  } as unknown as DynamoDBDocumentClient;
}

/** BatchGet responses used by PublishableKeyedRepository.loadDraftAndPublished. */
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
    const doc = mockDoc(async (command) => {
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
    const doc = mockDoc(async (command) => {
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
    const doc = mockDoc(async () => ({ Items: [buildMetaItem(draft)] }));
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
    const doc = mockDoc(async () => ({
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
    const doc = mockDoc(async (command) => {
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
    const published = await repo.publish(draft.id);
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBeTruthy();
    expect(published.version).toBe(2);
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('publish accepts an explicit publishedAt for migrations', async () => {
    const doc = mockDoc(async (command) => {
      if (command.constructor.name === 'BatchGetCommand') {
        return batchGetResponses(buildMetaItem(draft));
      }
      if (command.constructor.name === 'GetCommand') {
        return {};
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const published = await repo.publish(draft.id, {
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
    const next = await repo.publish(published.id);
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
});
