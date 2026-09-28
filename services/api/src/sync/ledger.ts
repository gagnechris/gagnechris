import {
  GetCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { SyncChange, SyncChangesQuery } from '@gagnechris/shared';
import { keys, syncPk } from '@gagnechris/data';
import { getDocClient, requireTableName } from '../data/client.js';
import { decodeCursor, encodeCursor } from '../data/cursor.js';
import { toEntity, type FixtureNoteItem } from '../fixture-notes/items.js';
import type { SyncLedgerItem } from '../fixture-notes/repository.js';

export type SyncChangesPage = {
  changes: SyncChange[];
  nextCursor?: string;
};

export class SyncLedger {
  constructor(
    protected readonly doc: DynamoDBDocumentClient = getDocClient(),
    protected readonly tableName: string = requireTableName(),
  ) {}

  async queryChangesSince(
    userId: string,
    query: SyncChangesQuery,
  ): Promise<SyncChangesPage> {
    const { since, cursor, limit } = query;
    const exclusiveStartKey = decodeCursor(cursor);
    const pk = syncPk(userId);

    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: since
          ? 'pk = :pk AND sk > :sinceSk'
          : 'pk = :pk AND begins_with(sk, :tsPrefix)',
        ExpressionAttributeValues: since
          ? {
              ':pk': pk,
              ':sinceSk': `TS#${since}`,
            }
          : {
              ':pk': pk,
              ':tsPrefix': 'TS#',
            },
        ExclusiveStartKey: exclusiveStartKey,
        Limit: limit,
      }),
    );

    const ledgerItems = (result.Items ?? []) as SyncLedgerItem[];
    const changes: SyncChange[] = [];

    for (const row of ledgerItems) {
      if (row.changeType !== 'fixtureNote') continue;
      const change: SyncChange = {
        type: 'fixtureNote',
        id: row.entityId,
        version: row.version,
        deleted: row.deleted,
        updatedAt: row.updatedAt,
      };
      if (!row.deleted) {
        const got = await this.doc.send(
          new GetCommand({
            TableName: this.tableName,
            Key: keys.fixture.meta(row.entityId),
          }),
        );
        if (got.Item) {
          change.entity = toEntity(got.Item as FixtureNoteItem);
        }
      }
      changes.push(change);
    }

    return {
      changes,
      nextCursor: encodeCursor(
        result.LastEvaluatedKey as Record<string, unknown> | undefined,
      ),
    };
  }
}
