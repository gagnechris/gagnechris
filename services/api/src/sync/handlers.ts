import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  SyncChangesQuerySchema,
  SyncChangesResponseSchema,
} from '@gagnechris/shared';
import { json } from '../http.js';
import { dispatchRoutes, type RouteDef, type RouteHandler } from '../router.js';
import { SyncLedger } from './ledger.js';

function syncHandlers(ledger?: SyncLedger): { changes: RouteHandler } {
  const store = () => ledger ?? new SyncLedger();
  return {
    changes: async (ctx, { query }) => {
      const userId = ctx.userId;
      if (!userId) {
        return json(401, {
          error: 'unauthorized',
          message: 'Missing JWT claims',
        });
      }
      const parsedQuery = query as ReturnType<
        typeof SyncChangesQuerySchema.parse
      >;
      const page = await store().queryChangesSince(userId, parsedQuery);
      return json(200, SyncChangesResponseSchema.parse(page));
    },
  };
}

export function createSyncRoutes(ledger?: SyncLedger): RouteDef[] {
  const h = syncHandlers(ledger);
  return [
    {
      method: 'GET',
      pattern: '/notebook/sync/changes',
      auth: 'admin',
      metric: 'SyncChanges',
      query: SyncChangesQuerySchema,
      handler: h.changes,
    },
  ];
}

export const syncRoutes = createSyncRoutes();

export async function handleSyncRoutes(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
  ledger?: SyncLedger,
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  return dispatchRoutes(createSyncRoutes(ledger), event, method, path, {
    onMiss: 'undefined',
    enforceAuth: false,
  });
}
