import { describe, expect, it } from 'vitest';
import {
  assertIntegrationTableName,
  INTEGRATION_TABLE_PREFIX,
} from './support/dynamo-local.js';

describe('assertIntegrationTableName (CHR-151)', () => {
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
