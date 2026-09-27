import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_HOME, type Home } from '@gagnechris/shared';
import { ConflictError } from '../src/data/errors.js';
import { buildHomeMetaItem } from '../src/home/keys.js';
import { HomeRepository } from '../src/home/repository.js';

const stored: Home = {
  ...DEFAULT_HOME,
  status: 'published',
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 3,
};

type FakeCommand = { constructor: { name: string }; input: Record<string, unknown> };

function mockDoc(impl: (command: FakeCommand) => Promise<unknown>) {
  const send = vi.fn(async (command: FakeCommand) => impl(command));
  return {
    doc: { send } as unknown as DynamoDBDocumentClient,
    send,
  };
}

describe('HomeRepository', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'gagnechris-test';
  });

  it('reads the singleton by key', async () => {
    const { doc, send } = mockDoc(async () => ({
      Item: buildHomeMetaItem(stored),
    }));
    const home = await new HomeRepository(doc, 'gagnechris-test').get();
    expect(home?.version).toBe(3);
    expect(send.mock.calls[0]![0]!.input.Key).toEqual({
      pk: 'HOME#current',
      sk: 'META',
    });
  });

  it('seeds published home content on first read', async () => {
    const { doc, send } = mockDoc(async () => ({}));
    const home = await new HomeRepository(doc, 'gagnechris-test').getOrCreate();
    expect(home.status).toBe('published');
    expect(home.publishedAt).toBeTruthy();
    expect(home.version).toBe(1);
    expect(home.about).toContain('Engineering Leader at Ro');

    const put = send.mock.calls[1]![0]!;
    expect(put.constructor.name).toBe('PutCommand');
    expect(put.input.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect((put.input.Item as { entityType: string }).entityType).toBe('home');
    expect(put.input.Item).not.toHaveProperty('gsi1pk');
  });

  it('updates copy and bumps the version', async () => {
    const { doc, send } = mockDoc(async (command) =>
      command.constructor.name === 'GetCommand'
        ? { Item: buildHomeMetaItem(stored) }
        : {},
    );
    const next = await new HomeRepository(doc, 'gagnechris-test').update({
      version: 3,
      about: 'New about copy.',
      title: 'Engineering Director',
    });
    expect(next.about).toBe('New about copy.');
    expect(next.title).toBe('Engineering Director');
    expect(next.name).toBe(stored.name);
    expect(next.version).toBe(4);
    expect(next.status).toBe('published');
    expect(send.mock.calls[1]![0]!.input.ExpressionAttributeValues).toEqual({
      ':v': 3,
    });
  });

  it('rejects a stale version', async () => {
    const { doc } = mockDoc(async () => ({ Item: buildHomeMetaItem(stored) }));
    await expect(
      new HomeRepository(doc, 'gagnechris-test').update({ version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps a failed conditional write to a conflict', async () => {
    const { doc } = mockDoc(async (command) => {
      if (command.constructor.name === 'GetCommand') {
        return { Item: buildHomeMetaItem(stored) };
      }
      throw new ConditionalCheckFailedException({
        message: 'conditional request failed',
        $metadata: {},
      });
    });
    await expect(
      new HomeRepository(doc, 'gagnechris-test').update({ version: 3 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('publish is a no-op when already published', async () => {
    const { doc, send } = mockDoc(async () => ({
      Item: buildHomeMetaItem(stored),
    }));
    const home = await new HomeRepository(doc, 'gagnechris-test').publish();
    expect(home.version).toBe(3);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('unpublish keeps publishedAt', async () => {
    const { doc } = mockDoc(async (command) =>
      command.constructor.name === 'GetCommand'
        ? { Item: buildHomeMetaItem(stored) }
        : {},
    );
    const home = await new HomeRepository(doc, 'gagnechris-test').unpublish();
    expect(home.status).toBe('draft');
    expect(home.publishedAt).toBe(stored.publishedAt);
    expect(home.version).toBe(4);
  });
});
