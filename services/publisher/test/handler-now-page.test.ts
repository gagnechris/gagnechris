import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttributeValue, Context, DynamoDBRecord } from 'aws-lambda';
import { handler, setPublisherHandlerDepsForTests } from '../src/handler.js';
import { publishTargets } from '../src/publish-targets/registry.js';
import type { SiteStorage } from '../src/storage.js';
import nowPageTarget from './fixtures/now-page.target.js';

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

function memoryStorage(): SiteStorage & { puts: string[] } {
  const objects = new Map<string, string | Uint8Array>();
  const puts: string[] = [];
  return {
    puts,
    async readShell() {
      return '<html><head></head><body><div id="root"></div></body></html>';
    },
    async read(key) {
      const v = objects.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    async put(key, body) {
      objects.set(key, body);
      puts.push(key);
      return true;
    },
    async delete(key) {
      if (!objects.has(key)) return false;
      objects.delete(key);
      return true;
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix));
    },
    async invalidate() {},
  };
}

const fakeContext = { awsRequestId: 'test' } as Context;

describe('handler + now-page fixture (CHR-179)', () => {
  afterEach(() => {
    setPublisherHandlerDepsForTests(undefined);
  });

  it('rebuilds through the real handler when a registered target claims the entity', async () => {
    const storage = memoryStorage();
    const targets = [...publishTargets, nowPageTarget];
    const { rebuildPublishedSite } = await import('../src/s3-site.js');

    setPublisherHandlerDepsForTests({
      getTargets: () => targets,
      rebuild: (options) =>
        rebuildPublishedSite({
          ...options,
          storage,
          sources: {
            listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
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
