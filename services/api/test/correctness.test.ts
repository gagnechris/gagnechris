import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  VersionedRepository,
  unscoped,
  type VersionedEntity,
} from '../src/data/versioned-repository.js';
import { assertCursorMatchesQuery, encodeCursor } from '../src/data/cursor.js';
import { mapRouteError } from '../src/http.js';
import {
  ConflictError,
  DataIntegrityError,
  PreconditionFailedError,
} from '../src/data/errors.js';
import { metrics } from '../src/observability.js';
import { PostsRepository } from '../src/posts/repository.js';
import { buildMetaItem } from '@gagnechris/data';
import { mockDocClient } from './support/mock-doc.js';

type Note = VersionedEntity & { id: string; title: string };
type NoteItem = {
  pk: string;
  sk: string;
  id: string;
  title: string;
  version: number;
  updatedAt: string;
  createHash?: string;
};

describe('correctness guards', () => {
  it('assertCursorMatchesQuery rejects foreign partition / sort bound', () => {
    expect(() =>
      assertCursorMatchesQuery(
        { syncPk: 'SYNC#b', syncSk: '2026-10-02T10:00:00.000Z#X#1' },
        { partitionAttr: 'syncPk', partitionValue: 'SYNC#a' },
      ),
    ).toThrow(SyntaxError);

    expect(() =>
      assertCursorMatchesQuery(
        {
          syncPk: 'SYNC#a',
          syncSk: '2026-10-02T10:00:00.000Z#X#1',
        },
        {
          partitionAttr: 'syncPk',
          partitionValue: 'SYNC#a',
          sortAttr: 'syncSk',
          sortLowerBoundInclusive: '2026-10-02T11:00:00.000Z',
        },
      ),
    ).toThrow(SyntaxError);

    expect(() =>
      assertCursorMatchesQuery(
        {
          syncPk: 'SYNC#a',
          syncSk: '2026-10-02T11:00:00.000Z#X#1',
        },
        {
          partitionAttr: 'syncPk',
          partitionValue: 'SYNC#a',
          sortAttr: 'syncSk',
          sortLowerBoundInclusive: '2026-10-02T10:00:00.000Z',
        },
      ),
    ).not.toThrow();
  });

  it('getRawItem uses ConsistentRead so createHash is not dropped', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Item: {
          pk: 'NOTE#n1',
          sk: 'META',
          id: 'n1',
          title: 'A',
          version: 1,
          updatedAt: '2026-10-02T00:00:00.000Z',
          createHash: 'h1',
        },
      })
      .mockResolvedValueOnce({});

    const repo = new VersionedRepository<Note, NoteItem, string>(
      {
        conflictLabel: 'note',
        scope: unscoped({
          keyForId: (id) => ({ pk: `NOTE#${id}`, sk: 'META' }),
          idOf: (n) => n.id,
        }),
        toEntity: (item) => ({
          id: item.id,
          title: item.title,
          version: item.version,
          updatedAt: item.updatedAt,
        }),
        toItem: (n) => ({
          pk: `NOTE#${n.id}`,
          sk: 'META',
          id: n.id,
          title: n.title,
          version: n.version,
          updatedAt: n.updatedAt,
        }),
      },
      { send } as never,
      'test-table',
    );

    await repo.updateIfVersion('n1', 1, {
      id: 'n1',
      title: 'B',
      version: 2,
      updatedAt: '2026-10-02T01:00:00.000Z',
    });

    const get = send.mock.calls[0]![0] as GetCommand;
    expect(get).toBeInstanceOf(GetCommand);
    expect(get.input.ConsistentRead).toBe(true);

    const put = send.mock.calls[1]![0] as PutCommand;
    expect(put.input.Item?.createHash).toBe('h1');
  });

  it('mapRouteError DataIntegrityError emits log metric (fails if removed)', () => {
    const spy = vi.spyOn(metrics, 'addMetric');
    const res = mapRouteError(
      new DataIntegrityError('bad', { pk: 'POST#1', sk: 'META' }),
    );
    expect(res?.statusCode).toBe(500);
    expect(spy).toHaveBeenCalledWith(
      'DataIntegrityError',
      expect.anything(),
      1,
    );
    spy.mockRestore();
  });

  it('mapRouteError counts 409 and 412 as WriteConflict (fails if removed)', () => {
    const spy = vi.spyOn(metrics, 'addMetric');
    expect(mapRouteError(new ConflictError('stale'))?.statusCode).toBe(409);
    expect(
      mapRouteError(new PreconditionFailedError('stale'))?.statusCode,
    ).toBe(412);
    const conflictCalls = spy.mock.calls.filter(
      ([name]) => name === 'WriteConflict',
    );
    expect(conflictCalls).toHaveLength(2);
    spy.mockRestore();
  });

  it('stale version + taken slug prefers version conflict with current', async () => {
    const draft = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      title: 'Hello',
      slug: 'hello',
      excerpt: '',
      bodyMarkdown: '',
      tags: [] as string[],
      coverImage: null,
      seo: null,
      status: 'draft' as const,
      publishedAt: null,
      updatedAt: '2026-09-27T00:00:00.000Z',
      version: 1,
      hasUnpublishedChanges: false,
    };
    let batchGets = 0;
    const doc = mockDocClient(async (command) => {
      if (command.constructor.name === 'BatchGetCommand') {
        batchGets += 1;
        return {
          Responses: {
            'gagnechris-test': [
              buildMetaItem({
                ...draft,
                // First load for update pre-read; later consistent re-read.
                version: batchGets === 1 ? 1 : 3,
                title: batchGets === 1 ? 'Hello' : 'Server',
              }),
            ],
          },
        };
      }
      if (command.constructor.name === 'TransactWriteCommand') {
        // META (0) + slug rename items; claim Put is index 3.
        throw new TransactionCanceledException({
          message: 'cancelled',
          $metadata: {},
          CancellationReasons: [
            { Code: 'ConditionalCheckFailed' },
            { Code: 'None' },
            { Code: 'None' },
            { Code: 'ConditionalCheckFailed' },
          ],
        });
      }
      return {};
    });

    const repo = new PostsRepository(doc, 'gagnechris-test');
    await expect(
      repo.update(draft.id, {
        version: 1,
        slug: 'taken-elsewhere',
        title: 'Nope',
      }),
    ).rejects.toMatchObject({
      name: 'ConflictError',
      code: 'version_conflict',
      currentVersion: 3,
      current: expect.objectContaining({ title: 'Server', version: 3 }),
    });
  });

  it('multi-status cursor with out-of-range i returns SyntaxError', async () => {
    const repo = new PostsRepository(
      mockDocClient(async () => ({ Items: [] })),
      'gagnechris-test',
    );
    const bad = encodeCursor({ i: 99 });
    await expect(repo.list(undefined, { cursor: bad })).rejects.toBeInstanceOf(
      SyntaxError,
    );
  });
});

describe('ConsistentRead on publishable mutation pre-reads', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('PostsRepository.update loads with ConsistentRead', async () => {
    const draft = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      title: 'Hello',
      slug: 'hello',
      excerpt: '',
      bodyMarkdown: '',
      tags: [] as string[],
      coverImage: null,
      seo: null,
      status: 'draft' as const,
      publishedAt: null,
      updatedAt: '2026-09-27T00:00:00.000Z',
      version: 1,
      hasUnpublishedChanges: false,
    };
    const sends: unknown[] = [];
    const doc = mockDocClient(async (command) => {
      sends.push(command);
      if (command.constructor.name === 'BatchGetCommand') {
        return {
          Responses: {
            'gagnechris-test': [buildMetaItem(draft)],
          },
        };
      }
      return {};
    });
    const repo = new PostsRepository(doc, 'gagnechris-test');
    await repo.update(draft.id, { version: 1, title: 'Hi' });
    const batchGet = sends.find(
      (c) =>
        (c as { constructor: { name: string } }).constructor.name ===
        'BatchGetCommand',
    ) as {
      input: { RequestItems: Record<string, { ConsistentRead?: boolean }> };
    };
    expect(batchGet.input.RequestItems['gagnechris-test']?.ConsistentRead).toBe(
      true,
    );
  });
});
