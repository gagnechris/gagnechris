/**
 * Generic optimistic-concurrency entity store (CHR-129 / CHR-153 / CHR-161).
 * Optional sync config writes sparse GSI keys on META (one row per entity).
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { syncPk, syncSk, ttlDaysFromNow } from '@gagnechris/data';
import { ZodError } from 'zod';
import { getDocClient, requireTableName } from './client.js';
import { decodeCursor, encodeCursor, PRIMARY_CURSOR_KEYS } from './cursor.js';
import { runDynamoWrite } from './dynamo-write.js';
import { ConflictError, DataIntegrityError, NotFoundError } from './errors.js';
import {
  VERSION_MATCH_CONDITION,
  runVersionedWrite,
  throwVersionConflict,
} from './version-condition.js';

export { VERSION_MATCH_CONDITION } from './version-condition.js';

export type VersionedEntity = {
  version: number;
  updatedAt: string;
};

export type SyncEntityConfig<T extends VersionedEntity> = {
  /** Stable change-feed type (e.g. `fakeNote`). Stored as `entityType` when writing sync keys. */
  changeType: string;
  userIdOf: (entity: T) => string;
  /**
   * Hash of create payload fields. Retries with the same id but a different
   * hash throw ConflictError (409); matching hash is idempotent.
   */
  createPayloadHash?: (entity: T) => string;
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
  /** Required cursor key names for queryPage (defaults to primary keys). */
  cursorKeyNames?: readonly string[];
  /**
   * When set, every write stamps `syncPk` / `syncSk` on the META item so the
   * sparse sync GSI returns one latest row per entity (CHR-153).
   */
  sync?: SyncEntityConfig<T>;
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

  protected mapItem(raw: unknown): T {
    try {
      return this.config.toEntity(raw as TItem);
    } catch (error) {
      const item =
        raw && typeof raw === 'object'
          ? (raw as { pk?: unknown; sk?: unknown })
          : {};
      const pk = typeof item.pk === 'string' ? item.pk : undefined;
      const sk = typeof item.sk === 'string' ? item.sk : undefined;
      if (error instanceof ZodError || error instanceof DataIntegrityError) {
        throw new DataIntegrityError(
          `Corrupt stored ${this.config.conflictLabel}${pk ? ` (${pk}/${sk ?? '?'})` : ''}`,
          { pk, sk, cause: error },
        );
      }
      throw error;
    }
  }

  /** Attach sparse sync GSI keys when sync is configured. */
  protected toStoredItem(entity: T, opts?: { ttl?: number }): TItem {
    const base = this.config.toItem(entity);
    const sync = this.config.sync;
    if (!sync) {
      return opts?.ttl !== undefined
        ? ({ ...base, ttl: opts.ttl } as TItem)
        : base;
    }
    const userId = sync.userIdOf(entity);
    const id = this.config.idOf(entity);
    return {
      ...base,
      syncPk: syncPk(userId),
      syncSk: syncSk(entity.updatedAt, sync.changeType, id),
      ...(opts?.ttl !== undefined ? { ttl: opts.ttl } : {}),
    } as TItem;
  }

  async get(id: string): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.config.keyForId(id),
      }),
    );
    if (!result.Item) return undefined;
    const entity = this.mapItem(result.Item);
    if (this.config.isDeleted?.(entity)) return undefined;
    return entity;
  }

  /** Like get, but returns soft-deleted entities (for idempotent-create / conflicts). */
  async getIncludingDeleted(id: string): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.config.keyForId(id),
      }),
    );
    if (!result.Item) return undefined;
    return this.mapItem(result.Item);
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
            Item: this.toStoredItem(entity),
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        ),
      `Create conflict (${this.config.conflictLabel})`,
    );
    return entity;
  }

  /**
   * Client-ULID create: retries with the same id are idempotent when the
   * optional payload hash matches; mismatch or tombstone → ConflictError.
   */
  async createIdempotent(entity: T): Promise<T> {
    const id = this.config.idOf(entity);
    try {
      return await this.create(entity);
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }
      const existing = await this.getIncludingDeleted(id);
      if (!existing) {
        throw new ConflictError(
          `Create conflict (${this.config.conflictLabel})`,
        );
      }
      if (this.config.isDeleted?.(existing)) {
        throw new ConflictError(
          `${this.config.conflictLabel} ${id} was deleted`,
          { currentVersion: existing.version, current: existing },
        );
      }
      const hashFn = this.config.sync?.createPayloadHash;
      if (hashFn && hashFn(entity) !== hashFn(existing)) {
        throw new ConflictError(
          `${this.config.conflictLabel} ${id} already exists with a different payload`,
          { currentVersion: existing.version, current: existing },
        );
      }
      return existing;
    }
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
    await runVersionedWrite(
      () =>
        this.doc.send(
          new PutCommand({
            TableName: this.tableName,
            Item: this.toStoredItem(next),
            ConditionExpression: VERSION_MATCH_CONDITION,
            ExpressionAttributeValues: { ':v': expectedVersion },
          }),
        ),
      `Update conflict (${this.config.conflictLabel} version)`,
      () =>
        throwVersionConflict(expectedVersion, () =>
          this.getIncludingDeleted(id),
        ),
    );
    return next;
  }

  /**
   * Soft-delete via caller-supplied tombstone entity (must bump version).
   * Sets DynamoDB TTL when sync is configured so the GSI row expires with META.
   */
  async softDelete(
    id: string,
    expectedVersion: number,
    tombstone: T,
  ): Promise<T> {
    const ttl = this.config.sync ? ttlDaysFromNow() : undefined;
    await runVersionedWrite(
      () =>
        this.doc.send(
          new PutCommand({
            TableName: this.tableName,
            Item: this.toStoredItem(tombstone, { ttl }),
            ConditionExpression: VERSION_MATCH_CONDITION,
            ExpressionAttributeValues: { ':v': expectedVersion },
          }),
        ),
      `Delete conflict (${this.config.conflictLabel} version)`,
      () =>
        throwVersionConflict(expectedVersion, () =>
          this.getIncludingDeleted(id),
        ),
    );
    return tombstone;
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
    const cursorKeys = this.config.cursorKeyNames ?? PRIMARY_CURSOR_KEYS;
    const exclusiveStartKey = decodeCursor(input.cursor, cursorKeys);
    const result = await this.doc.send(
      new QueryCommand({
        ...input,
        TableName: this.tableName,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: input.limit,
      }),
    );
    const items: T[] = [];
    for (const raw of result.Items ?? []) {
      try {
        const entity = this.mapItem(raw);
        if (this.config.isDeleted?.(entity)) continue;
        items.push(entity);
      } catch (error) {
        if (error instanceof DataIntegrityError) continue;
        throw error;
      }
    }
    return {
      items,
      nextCursor: encodeCursor(
        result.LastEvaluatedKey as Record<string, unknown> | undefined,
      ),
    };
  }
}
