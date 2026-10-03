// Watermark + overlap window absorbs clock skew.
import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  SYNC_DEFAULT_PAGE_LIMIT,
  type SyncChangesQuery,
} from '@gagnechris/shared';
import {
  GSI3_NAME,
  syncPk,
  syncSinceLowerBound,
  normalizeSyncSince,
  syncResyncHorizonIso,
} from '@gagnechris/data';
import { getDocClient, requireTableName } from '../data/client.js';
import {
  assertCursorMatchesQuery,
  decodeCursor,
  encodeCursor,
} from '../data/cursor.js';
import { throwCursorValidation } from '../data/dynamo-errors.js';
import {
  ResyncRequiredError,
  SyncAdapterMissingError,
} from '../data/errors.js';
import { getSyncAdapter, type SyncFeedChange } from './registry.js';

export const SYNC_GSI_CURSOR_KEYS = ['pk', 'sk', 'syncPk', 'syncSk'] as const;

/** Binds a cursor to the query's `since` lower bound; stripped before Dynamo. */
const SYNC_CURSOR_SINCE_ATTR = 'boundSince';

const SYNC_CURSOR_KEYS = [
  ...SYNC_GSI_CURSOR_KEYS,
  SYNC_CURSOR_SINCE_ATTR,
] as const;

/** Stops a partition of skipped (corrupt) rows from running the Lambda to its timeout. */
export const SYNC_MAX_QUERIES_PER_PAGE = 5;

export type SyncChangesPage = {
  changes: SyncFeedChange[];
  nextCursor?: string;
  /** Opaque server watermark; pass back as `since` on the next poll. */
  nextSince: string;
};

function itemChangeType(item: Record<string, unknown>): string | undefined {
  if (typeof item.entityType === 'string' && item.entityType.length > 0) {
    return item.entityType;
  }
  if (typeof item.changeType === 'string' && item.changeType.length > 0) {
    return item.changeType;
  }
  return undefined;
}

export class SyncLedger {
  constructor(
    protected readonly doc: DynamoDBDocumentClient = getDocClient(),
    protected readonly tableName: string = requireTableName(),
    protected readonly nowIso: () => string = () => new Date().toISOString(),
  ) {}

  async queryChangesSince(
    userId: string,
    query: SyncChangesQuery,
  ): Promise<SyncChangesPage> {
    const watermarkAt = this.nowIso();
    const { since, cursor, limit } = query;
    if (since !== undefined) {
      const normalized = normalizeSyncSince(since);
      const horizon = syncResyncHorizonIso(new Date(watermarkAt));
      if (Date.parse(normalized) < Date.parse(horizon)) {
        throw new ResyncRequiredError(
          'Sync watermark is older than the tombstone retention horizon; full resync required',
        );
      }
    }
    const pk = syncPk(userId);
    const lowerBound = syncSinceLowerBound(since);
    const boundSince = lowerBound ?? '';
    const decoded = decodeCursor(cursor, SYNC_CURSOR_KEYS);
    assertCursorMatchesQuery(decoded, {
      partitionAttr: 'syncPk',
      partitionValue: pk,
      ...(lowerBound
        ? { sortAttr: 'syncSk', sortLowerBoundInclusive: lowerBound }
        : {}),
      binding: { attr: SYNC_CURSOR_SINCE_ATTR, value: boundSince },
    });
    let startKey: Record<string, unknown> | undefined;
    if (decoded) {
      const { [SYNC_CURSOR_SINCE_ATTR]: _bound, ...key } = decoded;
      startKey = key;
    }

    const pageLimit = limit ?? SYNC_DEFAULT_PAGE_LIMIT;
    const changes: SyncFeedChange[] = [];
    let lastKey: Record<string, unknown> | undefined;
    // `limit` counts returned changes, not evaluated rows: keep reading while
    // skipped rows leave the page short (bounded by SYNC_MAX_QUERIES_PER_PAGE).
    for (let round = 1; ; round += 1) {
      let result;
      try {
        result = await this.doc.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: GSI3_NAME,
            KeyConditionExpression: lowerBound
              ? 'syncPk = :pk AND syncSk >= :sinceSk'
              : 'syncPk = :pk',
            ExpressionAttributeValues: lowerBound
              ? {
                  ':pk': pk,
                  // syncSk starts with ISO timestamp; compare against the lower-bound
                  // instant so any type/id suffix sorts after that prefix boundary.
                  ':sinceSk': lowerBound,
                }
              : {
                  ':pk': pk,
                },
            ExclusiveStartKey: startKey,
            Limit: pageLimit - changes.length,
          }),
        );
      } catch (error) {
        throwCursorValidation(error);
      }

      for (const raw of result.Items ?? []) {
        const item = raw as Record<string, unknown>;
        const changeType = itemChangeType(item);
        if (!changeType) continue;
        const adapter = getSyncAdapter(changeType);
        // Fail the page (500 + SyncAdapterMissing alarm) instead of skipping:
        // the client would advance past `nextSince` and never see the row.
        if (!adapter) throw new SyncAdapterMissingError(changeType);
        const change = adapter.toChange(item);
        if (change) changes.push(change);
      }

      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      if (
        !lastKey ||
        changes.length >= pageLimit ||
        round >= SYNC_MAX_QUERIES_PER_PAGE
      ) {
        break;
      }
      startKey = lastKey;
    }

    return {
      changes,
      nextCursor: encodeCursor(
        lastKey
          ? { ...lastKey, [SYNC_CURSOR_SINCE_ATTR]: boundSince }
          : undefined,
      ),
      nextSince: watermarkAt,
    };
  }
}
