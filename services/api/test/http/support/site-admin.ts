import { expect } from 'vitest';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { ApiResponse } from './api.js';
import { siteAdmin } from './claims.js';
import type { Harness } from './harness.js';

// Bodies are whatever JSON the server sent; suites assert on their shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/** Site-content requests as the admin app sends them. */
export function siteAdminClient(h: Harness) {
  const call = (
    method: string,
    path: string,
    opts: { body?: unknown; query?: Record<string, string | number> } = {},
  ): Promise<ApiResponse> =>
    h.api.request(method, path, { ...opts, claims: siteAdmin() });

  const ok = async (
    method: string,
    path: string,
    opts?: Parameters<typeof call>[2],
  ): Promise<Json> => {
    const res = await call(method, path, opts);
    expect(
      res.status >= 200 && res.status < 300,
      `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`,
    ).toBe(true);
    return res.body;
  };

  const row = async (key: { pk: string; sk: string }) =>
    (
      await h.doc.send(
        new GetCommand({
          TableName: h.tableName,
          Key: key,
          ConsistentRead: true,
        }),
      )
    ).Item;

  return { call, ok, row };
}
