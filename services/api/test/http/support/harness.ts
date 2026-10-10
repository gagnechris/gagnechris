import { afterAll, beforeAll, beforeEach } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  createEphemeralIntegrationTable,
  createLocalDocClient,
  deleteIntegrationTable,
  truncateTable,
} from '../../support/dynamo-local.js';
import { startApi, type Api } from './api.js';

export type Harness = {
  /** The API under test, serving `tableName`. */
  readonly api: Api;
  readonly tableName: string;
  /** For seeding rows and checking what the API stored. */
  readonly doc: DynamoDBDocumentClient;
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

  beforeAll(async () => {
    tableName = await createEphemeralIntegrationTable(slug);
    api = await startApi(tableName, opts.env);
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
  };
}
