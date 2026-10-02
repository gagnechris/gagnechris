/**
 * Per-user sync change feed over the sparse sync GSI (CHR-153).
 * One META row per entity; no N+1 GetItem; watermark + overlap for clock skew.
 */
import {
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { SyncChange, SyncChangesQuery } from '@gagnechris/shared';
import {
  GSI3_NAME,
  syncPk,
  syncSinceLowerBound,
  normalizeSyncSince,
} from '@gagnechris/data';
import { getDocClient, requireTableName } from '../data/client.js';
import {
  assertCursorMatchesQuery,
  decodeCursor,
  encodeCursor,
} from '../data/cursor.js';
import { throwCursorValidation } from '../data/dynamo-errors.js';
import { getSyncAdapter } from './registry.js';

/** ExclusiveStartKey shape for the sync GSI (base keys + index keys). */
export const SYNC_GSI_CURSOR_KEYS = ['pk', 'sk', 'syncPk', 'syncSk'] as const;

export type SyncChangesPage = {
  changes: SyncChange[];
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
      // Validate / normalize early so bad client clocks fail as 400.
      normalizeSyncSince(since);
    }
    const exclusiveStartKey = decodeCursor(cursor, SYNC_GSI_CURSOR_KEYS);
    const pk = syncPk(userId);
    const lowerBound = syncSinceLowerBound(since);
    assertCursorMatchesQuery(exclusiveStartKey, {
      partitionAttr: 'syncPk',
      partitionValue: pk,
      ...(lowerBound
        ? { sortAttr: 'syncSk', sortLowerBoundInclusive: lowerBound }
        : {}),
    });

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
          ExclusiveStartKey: exclusiveStartKey,
          Limit: limit,
        }),
      );
    } catch (error) {
      throwCursorValidation(error);
    }

    const changes: SyncChange[] = [];
    for (const raw of result.Items ?? []) {
      const item = raw as Record<string, unknown>;
      const changeType = itemChangeType(item);
      if (!changeType) continue;
      const adapter = getSyncAdapter(changeType);
      if (!adapter) continue;
      const change = adapter.toChange(item);
      if (change) changes.push(change);
    }

    return {
      changes,
      nextCursor: encodeCursor(
        result.LastEvaluatedKey as Record<string, unknown> | undefined,
      ),
      nextSince: watermarkAt,
    };
  }
}
