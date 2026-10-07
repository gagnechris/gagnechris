import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttributeValue, Context, DynamoDBRecord } from 'aws-lambda';
import { handler, setPublisherHandlerDepsForTests } from '../src/handler.js';
import { publishTargets } from '../src/publish-targets/registry.js';
import nowPageTarget from './fixtures/now-page.target.js';
import { memoryStorage } from './fixtures/memory-storage.js';

vi.mock('../src/observability.js', () => ({
  logger: {
    addContext: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  metrics: {
    clearMetrics: vi.fn(),
    addMetric: vi.fn(),
    publishStoredMetrics: vi.fn(),
  },
}));

function nowPublishedImage(): Record<string, AttributeValue> {
  return {
    pk: { S: 'NOW#current' },
    sk: { S: 'PUBLISHED' },
    entityType: { S: 'now' },
    status: { S: 'published' },
    updatedAt: { S: '2026-10-02T12:00:00.000Z' },
  };
}

const fakeContext = { awsRequestId: 'test' } as Context;

describe('handler + now-page fixture', () => {
  afterEach(() => {
    setPublisherHandlerDepsForTests(undefined);
  });

  it('rebuilds through the real handler when a registered target claims the entity', async () => {
    const storage = memoryStorage();
    const targets = [...publishTargets, nowPageTarget];
    const { rebuildPublishedSite } = await import('../src/rebuild.js');

    setPublisherHandlerDepsForTests({
      getTargets: () => targets,
      rebuild: (options) =>
        rebuildPublishedSite({
          ...options,
          storage,
          sources: {
            readGeneration: async () => 0,
            listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
            listPublishedProjects: async () => ({
              projects: [],
              corruptSlugs: [],
            }),
            getPublishedResume: async () => ({ status: 'missing' as const }),
            getPublishedHome: async () => ({ status: 'missing' as const }),
          },
          targets,
        }),
    });

    const records: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'INSERT',
        eventSource: 'aws:dynamodb',
        dynamodb: { NewImage: nowPublishedImage() },
      },
    ];

    const result = await handler({ Records: records }, fakeContext);

    expect(result).toEqual({
      ok: true,
      publishedCount: 0,
      removedSlugs: [],
    });
    expect(storage.puts).toEqual(['now/index.html']);
  });

  it('skips through the real handler when no target claims the entity', async () => {
    const rebuild = vi.fn();
    setPublisherHandlerDepsForTests({
      getTargets: () => publishTargets,
      rebuild,
    });

    const records: DynamoDBRecord[] = [
      {
        eventID: '1',
        eventName: 'INSERT',
        eventSource: 'aws:dynamodb',
        dynamodb: { NewImage: nowPublishedImage() },
      },
    ];

    const result = await handler({ Records: records }, fakeContext);

    expect(result).toEqual({
      ok: true,
      publishedCount: 0,
      removedSlugs: [],
    });
    expect(rebuild).not.toHaveBeenCalled();
  });
});
