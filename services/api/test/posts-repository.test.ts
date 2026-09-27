import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PostsRepository } from '../src/posts/repository.js';
import { buildMetaItem } from '../src/posts/keys.js';
import type { Post } from '@gagnechris/shared';

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
};

function mockDoc(
  impl: (command: { constructor: { name: string }; input: unknown }) => Promise<unknown>,
): DynamoDBDocumentClient {
  return {
    send: vi.fn(async (command: { constructor: { name: string }; input: unknown }) =>
      impl(command),
    ),
  } as unknown as DynamoDBDocumentClient;
}

describe('PostsRepository', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'gagnechris-test';
  });

  it('creates a draft with slug claim + META in one transaction', async () => {
    const send = vi.fn(async () => ({}));
    const doc = { send } as unknown as DynamoDBDocumentClient;
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const post = await repo.create({ title: 'Hello World' });
    expect(post.status).toBe('draft');
    expect(post.slug).toBe('hello-world');
    expect(post.version).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0]![0] as {
      input: { TransactItems: unknown[] };
    };
    expect(cmd.input.TransactItems).toHaveLength(2);
  });

  it('gets by id from META item', async () => {
    const doc = mockDoc(async () => ({ Item: buildMetaItem(draft) }));
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const got = await repo.getById(draft.id);
    expect(got?.slug).toBe('hello');
  });

  it('gets by slug via slug claim then META', async () => {
    let calls = 0;
    const doc = mockDoc(async (command) => {
      calls += 1;
      if (calls === 1) {
        expect(command.constructor.name).toBe('GetCommand');
        return { Item: { postId: draft.id } };
      }
      return { Item: buildMetaItem(draft) };
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const got = await repo.getBySlug('hello');
    expect(got?.id).toBe(draft.id);
    expect(calls).toBe(2);
  });

  it('lists via gsi1 status partition', async () => {
    const doc = mockDoc(async () => ({ Items: [buildMetaItem(draft)] }));
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const items = await repo.list('draft');
    expect(items).toHaveLength(1);
  });

  it('publish flips status and bumps version', async () => {
    let calls = 0;
    const doc = mockDoc(async (command) => {
      calls += 1;
      if (command.constructor.name === 'GetCommand') {
        return { Item: buildMetaItem(draft) };
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
      if (command.constructor.name === 'GetCommand') {
        return { Item: buildMetaItem(draft) };
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    const published = await repo.publish(draft.id, {
      publishedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(published.publishedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});
