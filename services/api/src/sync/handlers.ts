import {
  SyncChangesQuerySchema,
  SyncChangesResponseSchema,
} from '@gagnechris/shared';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { SyncLedger } from './ledger.js';

export function createSyncRoutes(ledger?: SyncLedger): RouteDef[] {
  const store = () => ledger ?? new SyncLedger();
  return [
    defineRoute({
      method: 'GET',
      pattern: '/notebook/sync/changes',
      auth: 'admin',
      metric: 'SyncChanges',
      query: SyncChangesQuerySchema,
      handler: async (ctx, { query }) => {
        const userId = ctx.userId!;
        const page = await store().queryChangesSince(userId, query);
        return json(200, SyncChangesResponseSchema.parse(page));
      },
    }),
  ];
}

export const syncRoutes = createSyncRoutes();
