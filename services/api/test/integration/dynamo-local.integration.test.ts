import { describe, expect, it } from 'vitest';
import {
  createLocalDocClient,
  truncateTable,
} from '../support/dynamo-local.js';

describe('DynamoDB Local test helpers', () => {
  it('refuses to operate on non gagnechris-it- tables', async () => {
    await expect(
      truncateTable(createLocalDocClient(), 'gagnechris-local'),
    ).rejects.toThrow(/gagnechris-it-/);
  });
});
