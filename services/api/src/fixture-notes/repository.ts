import {
  GetCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  CreateFixtureNoteRequest,
  FixtureNote,
  UpdateFixtureNoteRequest,
} from '@gagnechris/shared';
import { isOptimisticLockConflict } from '@gagnechris/shared/server';
import { keys, syncPk, syncSk, ttlDaysFromNow } from '@gagnechris/data';
import { getDocClient, requireTableName } from '../data/client.js';
import { runDynamoWrite } from '../data/dynamo-write.js';
import { ConflictError, NotFoundError } from '../data/errors.js';
import {
  toEntity,
  toItem,
  toTombstoneItem,
  type FixtureNoteItem,
} from './items.js';

export type SyncLedgerItem = {
  pk: string;
  sk: string;
  entityType: 'syncChange';
  changeType: 'fixtureNote';
  entityId: string;
  version: number;
  deleted: boolean;
  updatedAt: string;
};

function syncLedgerItem(
  userId: string,
  entityId: string,
  updatedAt: string,
  version: number,
  deleted: boolean,
): SyncLedgerItem {
  return {
    pk: syncPk(userId),
    sk: syncSk(updatedAt, 'fixture', entityId),
    entityType: 'syncChange',
    changeType: 'fixtureNote',
    entityId,
    version,
    deleted,
    updatedAt,
  };
}

export class FixtureNotesRepository {
  constructor(
    protected readonly doc: DynamoDBDocumentClient = getDocClient(),
    protected readonly tableName: string = requireTableName(),
    protected readonly nowIso: () => string = () => new Date().toISOString(),
  ) {}

  private metaKey(id: string) {
    return keys.fixture.meta(id);
  }

  private async getMetaItem(id: string): Promise<FixtureNoteItem | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.metaKey(id),
      }),
    );
    if (!result.Item) return undefined;
    return result.Item as FixtureNoteItem;
  }

  private async transactMetaAndSync(
    metaItem: FixtureNoteItem,
    userId: string,
    conditionOnMeta?: {
      expression: string;
      values?: Record<string, unknown>;
    },
  ): Promise<void> {
    const ledger = syncLedgerItem(
      userId,
      metaItem.id,
      metaItem.updatedAt,
      metaItem.version,
      metaItem.deleted,
    );
    await runDynamoWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.tableName,
                  Item: metaItem,
                  ...(conditionOnMeta
                    ? {
                        ConditionExpression: conditionOnMeta.expression,
                        ...(conditionOnMeta.values
                          ? {
                              ExpressionAttributeValues: conditionOnMeta.values,
                            }
                          : {}),
                      }
                    : { ConditionExpression: 'attribute_not_exists(pk)' }),
                },
              },
              {
                Put: {
                  TableName: this.tableName,
                  Item: ledger,
                },
              },
            ],
          }),
        ),
      'Fixture note write conflict',
    );
  }

  async createIdempotent(
    userId: string,
    req: CreateFixtureNoteRequest,
  ): Promise<FixtureNote> {
    const now = this.nowIso();
    const entity: FixtureNote = {
      id: req.id,
      userId,
      title: req.title,
      body: req.body,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    const metaItem = toItem(entity);
    try {
      await this.transactMetaAndSync(metaItem, userId, {
        expression: 'attribute_not_exists(pk)',
      });
      return entity;
    } catch (error) {
      if (
        !(error instanceof ConflictError) &&
        !isOptimisticLockConflict(error)
      ) {
        throw error;
      }
      const existing = await this.getMetaItem(req.id);
      if (!existing) {
        throw new ConflictError('Fixture note create conflict');
      }
      if (existing.userId !== userId) {
        throw new ConflictError(
          `Fixture note ${req.id} belongs to another user`,
        );
      }
      return toEntity(existing);
    }
  }

  async getForUser(userId: string, id: string): Promise<FixtureNote> {
    const item = await this.getMetaItem(id);
    if (!item || item.userId !== userId) {
      throw new NotFoundError(`Fixture note ${id} not found`);
    }
    return toEntity(item);
  }

  async update(
    userId: string,
    id: string,
    expectedVersion: number,
    patch: UpdateFixtureNoteRequest,
  ): Promise<FixtureNote> {
    const current = await this.getForUser(userId, id);
    if (current.deleted) {
      throw new NotFoundError(`Fixture note ${id} not found`);
    }
    const updatedAt = this.nowIso();
    const next: FixtureNote = {
      ...current,
      title: patch.title ?? current.title,
      body: patch.body ?? current.body,
      version: current.version + 1,
      updatedAt,
    };
    const metaItem = toItem(next);
    try {
      await runDynamoWrite(
        () =>
          this.doc.send(
            new TransactWriteCommand({
              TransactItems: [
                {
                  Put: {
                    TableName: this.tableName,
                    Item: metaItem,
                    ConditionExpression:
                      'attribute_exists(pk) AND version = :v AND userId = :uid',
                    ExpressionAttributeValues: {
                      ':v': expectedVersion,
                      ':uid': userId,
                    },
                  },
                },
                {
                  Put: {
                    TableName: this.tableName,
                    Item: syncLedgerItem(
                      userId,
                      id,
                      updatedAt,
                      next.version,
                      false,
                    ),
                  },
                },
              ],
            }),
          ),
        'Fixture note update conflict',
      );
      return next;
    } catch (error) {
      if (error instanceof ConflictError || isOptimisticLockConflict(error)) {
        const live = await this.getForUser(userId, id).catch(() => undefined);
        throw new ConflictError(
          `Version conflict: expected ${expectedVersion}, current ${live?.version ?? 'unknown'}`,
          { currentVersion: live?.version, current: live },
        );
      }
      throw error;
    }
  }

  async tombstone(
    userId: string,
    id: string,
    expectedVersion: number,
  ): Promise<FixtureNote> {
    const current = await this.getForUser(userId, id);
    if (current.deleted) {
      return current;
    }
    const updatedAt = this.nowIso();
    const ttl = ttlDaysFromNow();
    const next: FixtureNote = {
      ...current,
      deleted: true,
      version: current.version + 1,
      updatedAt,
    };
    const metaItem = toTombstoneItem(next, ttl);
    try {
      await runDynamoWrite(
        () =>
          this.doc.send(
            new TransactWriteCommand({
              TransactItems: [
                {
                  Put: {
                    TableName: this.tableName,
                    Item: metaItem,
                    ConditionExpression:
                      'attribute_exists(pk) AND version = :v AND userId = :uid',
                    ExpressionAttributeValues: {
                      ':v': expectedVersion,
                      ':uid': userId,
                    },
                  },
                },
                {
                  Put: {
                    TableName: this.tableName,
                    Item: syncLedgerItem(
                      userId,
                      id,
                      updatedAt,
                      next.version,
                      true,
                    ),
                  },
                },
              ],
            }),
          ),
        'Fixture note delete conflict',
      );
      return next;
    } catch (error) {
      if (error instanceof ConflictError || isOptimisticLockConflict(error)) {
        const live = await this.getForUser(userId, id).catch(() => undefined);
        throw new ConflictError(
          `Version conflict: expected ${expectedVersion}, current ${live?.version ?? 'unknown'}`,
          { currentVersion: live?.version, current: live },
        );
      }
      throw error;
    }
  }
}
