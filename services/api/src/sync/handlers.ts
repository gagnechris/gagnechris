import {
  CLIENT_VERSION_HEADER,
  isClientVersionSupported,
  parseClientVersion,
  SYNC_MIN_CLIENT_VERSION,
  SyncChangesQuerySchema,
  SyncChangesResponseSchema,
} from '@gagnechris/shared';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { headerValue } from '../data/concurrency.js';
import { UpgradeRequiredError } from '../data/errors.js';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { SyncLedger } from './ledger.js';

export type SyncRouteOptions = {
  /** Oldest accepted `x-gagnechris-client-version` (tests). */
  minClientVersion?: string;
  /** Tests widen it with fixture change types. */
  responseSchema?: { parse: (page: unknown) => unknown };
};

/** Absent header is allowed so web clients without it keep working. */
export function assertClientVersionSupported(
  event: APIGatewayProxyEventV2,
  minimum: string,
): void {
  const raw = headerValue(event.headers, CLIENT_VERSION_HEADER);
  if (raw == null || raw === '') return;
  const version = parseClientVersion(raw);
  if (!version) {
    throw new SyntaxError(`Invalid ${CLIENT_VERSION_HEADER} header`);
  }
  const min = parseClientVersion(minimum);
  if (!min) throw new Error(`Invalid minimum client version ${minimum}`);
  if (!isClientVersionSupported(version, min)) {
    throw new UpgradeRequiredError(
      `Client version ${raw.trim()} is older than the minimum ${minimum}; upgrade required`,
      minimum,
    );
  }
}

export function createSyncRoutes(
  ledger?: SyncLedger,
  options: SyncRouteOptions = {},
): RouteDef[] {
  const store = () => ledger ?? new SyncLedger();
  const minClientVersion = options.minClientVersion ?? SYNC_MIN_CLIENT_VERSION;
  const responseSchema = options.responseSchema ?? SyncChangesResponseSchema;
  return [
    defineRoute({
      method: 'GET',
      pattern: '/notebook/sync/changes',
      auth: 'admin',
      metric: 'SyncChanges',
      query: SyncChangesQuerySchema,
      handler: async (ctx, { query }) => {
        assertClientVersionSupported(ctx.event, minClientVersion);
        const page = await store().queryChangesSince(ctx.userId!, query);
        return json(200, responseSchema.parse(page));
      },
    }),
  ];
}

export const syncRoutes = createSyncRoutes();
