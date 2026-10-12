import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { apiCalls } from './call.js';
import { siteAdmin } from './claims.js';
import type { Harness } from './harness.js';

/** Site-content requests as the admin app sends them. */
export function siteAdminClient(h: Harness) {
  const { call, ok } = apiCalls(h, { claims: siteAdmin() });

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
