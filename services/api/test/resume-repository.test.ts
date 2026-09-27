import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_RESUME, type Resume } from '@gagnechris/shared';
import { ConflictError } from '../src/data/errors.js';
import { buildResumeMetaItem } from '../src/resume/keys.js';
import { ResumeRepository } from '../src/resume/repository.js';

const stored: Resume = {
  ...DEFAULT_RESUME,
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

describe('ResumeRepository', () => {
  beforeEach(() => {
    process.env.DATA_TABLE_NAME = 'gagnechris-test';
  });

  it('reads the singleton by key', async () => {
    const { doc, send } = mockDoc(async () => ({
      Item: buildResumeMetaItem(stored),
    }));
    const resume = await new ResumeRepository(doc, 'gagnechris-test').get();
    expect(resume?.version).toBe(3);
    expect(send.mock.calls[0]![0]!.input.Key).toEqual({
      pk: 'RESUME#current',
      sk: 'META',
    });
  });

  it('seeds a published resume on first read', async () => {
    const { doc, send } = mockDoc(async (command) =>
      command.constructor.name === 'GetCommand' ? {} : {},
    );
    const resume = await new ResumeRepository(doc, 'gagnechris-test').getOrCreate();
    expect(resume.status).toBe('published');
    expect(resume.publishedAt).toBeTruthy();
    expect(resume.version).toBe(1);
    expect(resume.content.experience.length).toBeGreaterThan(0);

    const put = send.mock.calls[1]![0]!;
    expect(put.constructor.name).toBe('PutCommand');
    expect(put.input.ConditionExpression).toBe('attribute_not_exists(pk)');
    expect((put.input.Item as { entityType: string }).entityType).toBe('resume');
    expect(put.input.Item).not.toHaveProperty('gsi1pk');
  });

  it('updates content and bumps the version', async () => {
    const { doc, send } = mockDoc(async (command) =>
      command.constructor.name === 'GetCommand'
        ? { Item: buildResumeMetaItem(stored) }
        : {},
    );
    const next = await new ResumeRepository(doc, 'gagnechris-test').update({
      version: 3,
      content: { ...stored.content, summary: 'New summary' },
    });
    expect(next.content.summary).toBe('New summary');
    expect(next.version).toBe(4);
    expect(next.status).toBe('published');
    expect(send.mock.calls[1]![0]!.input.ExpressionAttributeValues).toEqual({
      ':v': 3,
    });
  });

  it('rejects a stale version', async () => {
    const { doc } = mockDoc(async () => ({ Item: buildResumeMetaItem(stored) }));
    await expect(
      new ResumeRepository(doc, 'gagnechris-test').update({ version: 1 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps a failed conditional write to a conflict', async () => {
    const { doc } = mockDoc(async (command) => {
      if (command.constructor.name === 'GetCommand') {
        return { Item: buildResumeMetaItem(stored) };
      }
      throw new ConditionalCheckFailedException({
        message: 'conditional request failed',
        $metadata: {},
      });
    });
    await expect(
      new ResumeRepository(doc, 'gagnechris-test').update({ version: 3 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('publish is a no-op when already published', async () => {
    const { doc, send } = mockDoc(async () => ({
      Item: buildResumeMetaItem(stored),
    }));
    const resume = await new ResumeRepository(doc, 'gagnechris-test').publish();
    expect(resume.version).toBe(3);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('unpublish keeps publishedAt', async () => {
    const { doc } = mockDoc(async (command) =>
      command.constructor.name === 'GetCommand'
        ? { Item: buildResumeMetaItem(stored) }
        : {},
    );
    const resume = await new ResumeRepository(doc, 'gagnechris-test').unpublish();
    expect(resume.status).toBe('draft');
    expect(resume.publishedAt).toBe(stored.publishedAt);
    expect(resume.version).toBe(4);
  });
});
