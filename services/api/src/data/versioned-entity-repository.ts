/**
 * Generic optimistic-concurrency entity store (CHR-129).
 * No publish/META/PUBLISHED assumptions — suitable for Notebook notes/tasks.
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { isOptimisticLockConflict } from '@gagnechris/shared';
import { getDocClient, requireTableName } from './client.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { runDynamoWrite } from './dynamo-write.js';
import { ConflictError, NotFoundError } from './errors.js';

export type VersionedEntity = {
  version: number;
  updatedAt: string;
};

export type VersionedEntityConfig<
  T extends VersionedEntity,
  TItem extends Record<string, unknown>,
> = {
  conflictLabel: string;
  /** Primary key for a single entity. */
  keyForId: (id: string) => { pk: string; sk: string };
  /** Extract domain id from an entity (for create Put). */
  idOf: (entity: T) => string;
  toEntity: (item: TItem) => T;
  toItem: (entity: T) => TItem;
  /** True when the entity should be treated as soft-deleted / missing. */
  isDeleted?: (entity: T) => boolean;
  nowIso?: () => string;
};

export type QueryPage<T> = {
  items: T[];
  nextCursor?: string;
};

export class VersionedEntityRepository<
  T extends VersionedEntity,
  TItem extends Record<string, unknown>,
> {
  constructor(
    protected readonly config: VersionedEntityConfig<T, TItem>,
    protected readonly doc: DynamoDBDocumentClient = getDocClient(),
    protected readonly tableName: string = requireTableName(),
  ) {}

  protected now(): string {
    return this.config.nowIso?.() ?? new Date().toISOString();
  }

  async get(id: string): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.config.keyForId(id),
      }),
    );
    if (!result.Item) return undefined;
    const entity = this.config.toEntity(result.Item as TItem);
    if (this.config.isDeleted?.(entity)) return undefined;
    return entity;
  }

  async getOrThrow(id: string): Promise<T> {
    const entity = await this.get(id);
    if (!entity) {
      throw new NotFoundError(`${this.config.conflictLabel} ${id} not found`);
    }
    return entity;
  }

  async create(entity: T): Promise<T> {
    await runDynamoWrite(
      () =>
        this.doc.send(
          new PutCommand({
            TableName: this.tableName,
            Item: this.config.toItem(entity),
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        ),
      `Create conflict (${this.config.conflictLabel})`,
    );
    return entity;
  }

  /**
   * Replace the item when `expectedVersion` matches. Throws ConflictError with
   * `current` / `currentVersion` when the condition fails.
   */
  async updateIfVersion(
    id: string,
    expectedVersion: number,
    next: T,
  ): Promise<T> {
    try {
      await runDynamoWrite(
        () =>
          this.doc.send(
            new PutCommand({
              TableName: this.tableName,
              Item: this.config.toItem(next),
              ConditionExpression: 'attribute_exists(pk) AND version = :v',
              ExpressionAttributeValues: { ':v': expectedVersion },
            }),
          ),
        `Update conflict (${this.config.conflictLabel} version)`,
      );
      return next;
    } catch (error) {
      if (error instanceof ConflictError || isOptimisticLockConflict(error)) {
        const current = await this.get(id);
        throw new ConflictError(
          `Version conflict: expected ${expectedVersion}, current ${current?.version ?? 'unknown'}`,
          {
            currentVersion: current?.version,
            current,
          },
        );
      }
      throw error;
    }
  }

  /**
   * Soft-delete via caller-supplied tombstone entity (must bump version).
   */
  async softDelete(
    id: string,
    expectedVersion: number,
    tombstone: T,
  ): Promise<T> {
    return this.updateIfVersion(id, expectedVersion, tombstone);
  }

  /**
   * Query with opaque cursor pagination (follows LastEvaluatedKey).
   */
  async queryPage(
    input: Omit<QueryCommandInput, 'TableName' | 'ExclusiveStartKey'> & {
      cursor?: string;
      limit?: number;
    },
  ): Promise<QueryPage<T>> {
    const exclusiveStartKey = decodeCursor(input.cursor);
    const result = await this.doc.send(
      new QueryCommand({
        ...input,
        TableName: this.tableName,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: input.limit,
      }),
    );
    const items = (result.Items ?? []).map((item) =>
      this.config.toEntity(item as TItem),
    );
    return {
      items,
      nextCursor: encodeCursor(
        result.LastEvaluatedKey as Record<string, unknown> | undefined,
      ),
    };
  }
}
