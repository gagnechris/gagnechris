import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../../support/dynamo-local.js';
import { startApi, type Api } from './api.js';
import { assertRowsMatchSchemas, rowKey, type RowKey } from './row-schemas.js';

export type Harness = {
  /** The API under test, serving `tableName`. */
  readonly api: Api;
  readonly tableName: string;
  /** For seeding rows and checking what the API stored. */
  readonly doc: DynamoDBDocumentClient;
  /** Exempts a row the current test corrupts on purpose from the item schema check. */
  corruptRow(key: RowKey): void;
};

/**
 * One table and one API server per file; the table is emptied before each
 * test unless `truncate` is false.
 */
export function useApi(
  slug: string,
  opts: { env?: Record<string, string>; truncate?: boolean } = {},
): Harness {
  const doc = createLocalDocClient();
  let api: Api | undefined;
  let tableName: string | undefined;
  const corruptKeys = new Set<string>();

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable(slug);
    api = await startApi(tableName, opts.env);
  });

  // Before the next test's truncate, so every row a test leaves is checked.
  afterEach(async () => {
    try {
      await assertRowsMatchSchemas(doc, tableName!, corruptKeys);
    } finally {
      if (opts.truncate !== false) corruptKeys.clear();
    }
  });

  afterAll(async () => {
    await api?.stop();
    if (tableName) await deleteIntegrationTable(tableName);
  });

  if (opts.truncate !== false) {
    beforeEach(async () => {
      await truncateTable(doc, tableName!);
    });
  }

  return {
    get api() {
      if (!api) throw new Error('API not started');
      return api;
    },
    get tableName() {
      if (!tableName) throw new Error('table not created');
      return tableName;
    },
    doc,
    corruptRow(key) {
      corruptKeys.add(rowKey(key));
    },
  };
}
