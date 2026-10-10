import { describe, expect, it } from 'vitest';
import {
  assertIntegrationTableName,
  createLocalDocClient,
  INTEGRATION_TABLE_PREFIX,
  truncateTable,
} from './support/dynamo-local.js';

describe('assertIntegrationTableName', () => {
  it('allows gagnechris-it- prefix', () => {
    expect(() =>
      assertIntegrationTableName(`${INTEGRATION_TABLE_PREFIX}posts-abcd`),
    ).not.toThrow();
  });

  it('rejects gagnechris-local and gagnechris-test', () => {
    expect(() => assertIntegrationTableName('gagnechris-local')).toThrow(
      /gagnechris-it-/,
    );
    expect(() => assertIntegrationTableName('gagnechris-test')).toThrow(
      /gagnechris-it-/,
    );
  });
});

describe('truncateTable', () => {
  it('refuses to operate on non gagnechris-it- tables', async () => {
    await expect(
      truncateTable(createLocalDocClient(), 'gagnechris-local'),
    ).rejects.toThrow(/gagnechris-it-/);
  });
});
