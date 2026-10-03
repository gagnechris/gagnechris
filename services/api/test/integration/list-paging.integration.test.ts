import { afterAll, beforeAll, describe, it } from 'vitest';
import { clearSyncEntities } from '../../src/sync/registry.js';
import type { RouteDef } from '../../src/router.js';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
} from '../support/dynamo-local.js';
import {
  AREAS,
  STATUSES,
  corpusNote,
  corpusTask,
  expectExactIds,
  seedPagingCorpus,
  walkRoute,
} from '../support/paging-corpus.js';

const N = 150;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('list paging (DynamoDB Local)', () => {
  let tableName: string;
  let routes: RouteDef[];
  const doc = createLocalDocClient();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable('list-paging');
    process.env.DATA_TABLE_NAME = tableName;
    clearSyncEntities();
    ({ routes } = await seedPagingCorpus(doc, tableName, {
      notes: N,
      tasks: N,
    }));
  }, 120_000);

  afterAll(async () => {
    await deleteIntegrationTable(tableName);
  });

  it('notes: every area/type filter pages with no drops or duplicates', async () => {
    for (const area of [undefined, ...AREAS]) {
      for (const type of [undefined, 'daily', 'page'] as const) {
        const got = await walkRoute(routes, '/api/notebook/notes', {
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

  it('tasks: every area/status/open filter pages with no drops or duplicates', async () => {
    for (const area of [undefined, ...AREAS]) {
      for (const status of [undefined, ...STATUSES]) {
        for (const open of [undefined, 'true'] as const) {
          const got = await walkRoute(routes, '/api/notebook/tasks', {
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
                  (status ? t.status === status : !open || t.status !== 'done'),
              )
              .map((t) => t.id),
          );
        }
      }
    }
  }, 120_000);
});
