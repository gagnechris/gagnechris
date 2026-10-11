import { isOpenTaskStatus } from '@gagnechris/shared';
import { beforeAll, describe, it } from 'vitest';
import { useApi } from './support/harness.js';
import {
  AREAS,
  STATUSES,
  corpusNote,
  corpusTask,
  expectExactIds,
  SCHEDULE_QUERIES,
  seedPagingCorpus,
  walkRoute,
} from './support/paging-corpus.js';

const N = 150;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

const h = useApi('list-paging', { truncate: false });

describe('list paging (DynamoDB Local)', () => {
  beforeAll(async () => {
    await seedPagingCorpus(h, { notes: N, tasks: N });
  }, 120_000);

  it('notes: every area/type filter pages with no drops or duplicates', async () => {
    for (const area of [undefined, ...AREAS]) {
      for (const type of [undefined, 'daily', 'page'] as const) {
        const got = await walkRoute(h, '/api/notebook/notes', {
          limit: '20',
          ...(area ? { area } : {}),
          ...(type ? { type } : {}),
        });
        expectExactIds(
          got,
          range(N)
            .map(corpusNote)
            .filter(
              (n) => (!area || n.area === area) && (!type || n.type === type),
            )
            .map((n) => n.id),
        );
      }
    }
  }, 120_000);

  it('tasks: start-date and someday filters page every row', async () => {
    for (const { query, matches } of SCHEDULE_QUERIES) {
      for (const area of [undefined, ...AREAS]) {
        for (const open of [undefined, 'true'] as const) {
          const got = await walkRoute(h, '/api/notebook/tasks', {
            limit: '7',
            ...query,
            ...(area ? { area } : {}),
            ...(open ? { open } : {}),
          });
          expectExactIds(
            got,
            range(N)
              .map(corpusTask)
              .filter(
                (t) =>
                  matches(t) &&
                  (!area || t.area === area) &&
                  (!open || isOpenTaskStatus(t.status)),
              )
              .map((t) => t.id),
          );
        }
      }
    }
  }, 120_000);

  it('tasks: every area/status/open filter pages with no drops or duplicates', async () => {
    for (const area of [undefined, ...AREAS]) {
      for (const status of [undefined, ...STATUSES]) {
        for (const open of [undefined, 'true'] as const) {
          const got = await walkRoute(h, '/api/notebook/tasks', {
            limit: '20',
            ...(area ? { area } : {}),
            ...(status ? { status } : {}),
            ...(open ? { open } : {}),
          });
          expectExactIds(
            got,
            range(N)
              .map(corpusTask)
              .filter(
                (t) =>
                  (!area || t.area === area) &&
                  (status
                    ? t.status === status
                    : !open || isOpenTaskStatus(t.status)),
              )
              .map((t) => t.id),
          );
        }
      }
    }
  }, 120_000);
});
