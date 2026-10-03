/**
 * Owner-scoped optimistic-concurrency store (CHR-169).
 * All reads/writes take `(userId, id)`; keys and create claims include the owner.
 * Posts stay on {@link VersionedEntityRepository} (id-only keys).
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  isOptimisticLockConflict,
  ownerSyncCreateClaimPk,
  syncCreateClaimSk,
  syncPk,
  syncSk,
  SYNC_CREATE_CLAIM_TTL_DAYS,
  ttlDaysFromNow,
} from '@gagnechris/data';
import { ZodError } from 'zod';
import { getDocClient, requireTableName } from './client.js';
import { logCorruptStoredItem } from './corrupt-item.js';
import {
  assertCursorMatchesQuery,
  decodeCursor,
  encodeCursor,
  PRIMARY_CURSOR_KEYS,
} from './cursor.js';
import { throwCursorValidation } from './dynamo-errors.js';
import { runDynamoWrite } from './dynamo-write.js';
import { ConflictError, DataIntegrityError, NotFoundError } from './errors.js';
import {
  VERSION_MATCH_CONDITION,
  runVersionedWrite,
  throwVersionConflict,
  versionMatchValues,
} from './version-condition.js';
import { registerSyncEntity } from '../sync/registry.js';
import {
  type QueryPage,
  type SyncEntityConfig,
  type VersionedEntity,
} from './versioned-entity-repository.js';

export type OwnerScopedSyncConfig<T extends VersionedEntity> =
  SyncEntityConfig<T>;

export type UniqueClaimHook<T extends VersionedEntity> = {
  /**
   * Extra TransactWrite Put items after META (+ owner create claim when sync
   * is configured). Each item should use `attribute_not_exists(pk)` when it is
   * a uniqueness claim.
   */
  buildItems: (entity: T) => Array<{
    Put: {
      Item: Record<string, unknown>;
      ConditionExpression?: string;
    };
  }>;
  /** Indexes into the array returned by `buildItems` that are unique claims. */
  claimIndexes: readonly number[];
  conflictCode: 'slug_taken' | 'daily_taken';
  conflictMessage?: string;
  /**
   * When a unique claim conflicts during `createIdempotent`, resolve to the
   * existing winner (daily-note first-writer-wins). Return `undefined` to throw.
   */
  resolveConflict?: (entity: T) => Promise<T | undefined>;
};

export type OwnerScopedVersionedEntityConfig<
  T extends VersionedEntity,
  TItem extends Record<string, unknown>,
> = {
  conflictLabel: string;
  /** Primary key for a single entity owned by `userId`. */
  keyForId: (userId: string, id: string) => { pk: string; sk: string };
  idOf: (entity: T) => string;
  userIdOf: (entity: T) => string;
  toEntity: (item: TItem) => T;
  toItem: (entity: T) => TItem;
  isDeleted?: (entity: T) => boolean;
  nowIso?: () => string;
  cursorKeyNames?: readonly string[];
  cursorKeysByIndex?: Readonly<Record<string, readonly string[]>>;
  sync?: OwnerScopedSyncConfig<T>;
  /** Extra unique claims on create (e.g. daily note per area/date). */
  uniqueClaim?: UniqueClaimHook<T>;
};

/** GSI attribute names stripped from tombstones so list indexes stay clean. */
const GSI_LIST_KEYS = ['gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk'] as const;

function stripListGsiKeys<TItem extends Record<string, unknown>>(
  item: TItem,
): TItem {
  const next = { ...item };
  for (const key of GSI_LIST_KEYS) {
    delete next[key];
  }
  return next;
}

export class OwnerScopedVersionedEntityRepository<
  T extends VersionedEntity,
  TItem extends Record<string, unknown>,
> {
  constructor(
    protected readonly config: OwnerScopedVersionedEntityConfig<T, TItem>,
    protected readonly doc: DynamoDBDocumentClient = getDocClient(),
    protected readonly tableName: string = requireTableName(),
  ) {
    // Derive feed adapters from repository sync config (CHR-172).
    if (config.sync) {
      registerSyncEntity({
        changeType: config.sync.changeType,
        toChange: config.sync.toChange,
      });
    }
  }

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

  /** Reject cross-owner access even if a key collision somehow returned a row. */
  protected assertOwner(userId: string, entity: T): void {
    if (this.config.userIdOf(entity) !== userId) {
      throw new NotFoundError(
        `${this.config.conflictLabel} ${this.config.idOf(entity)} not found`,
      );
    }
  }

  protected toStoredItem(
    entity: T,
    opts?: { ttl?: number; createHash?: string },
  ): TItem {
    let base = this.config.toItem(entity);
    if (this.config.isDeleted?.(entity)) {
      base = stripListGsiKeys(base);
    }
    const sync = this.config.sync;
    if (!sync) {
      return {
        ...base,
        ...(opts?.ttl !== undefined ? { ttl: opts.ttl } : {}),
        ...(opts?.createHash !== undefined
          ? { createHash: opts.createHash }
          : {}),
      } as TItem;
    }
    const userId = sync.userIdOf(entity);
    const id = this.config.idOf(entity);
    return {
      ...base,
      entityType: sync.changeType,
      syncPk: syncPk(userId),
      syncSk: syncSk(entity.updatedAt, sync.changeType, id),
      ...(opts?.ttl !== undefined ? { ttl: opts.ttl } : {}),
      ...(opts?.createHash !== undefined
        ? { createHash: opts.createHash }
        : {}),
    } as TItem;
  }

  async get(
    userId: string,
    id: string,
    opts?: { consistentRead?: boolean },
  ): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.config.keyForId(userId, id),
        ...(opts?.consistentRead ? { ConsistentRead: true } : {}),
      }),
    );
    if (!result.Item) return undefined;
    const entity = this.mapItem(result.Item);
    if (this.config.userIdOf(entity) !== userId) return undefined;
    if (this.config.isDeleted?.(entity)) return undefined;
    return entity;
  }

  async getIncludingDeleted(
    userId: string,
    id: string,
    opts?: { consistentRead?: boolean },
  ): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.config.keyForId(userId, id),
        ...(opts?.consistentRead ? { ConsistentRead: true } : {}),
      }),
    );
    if (!result.Item) return undefined;
    const entity = this.mapItem(result.Item);
    if (this.config.userIdOf(entity) !== userId) return undefined;
    return entity;
  }

  protected async getRawItem(
    userId: string,
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.config.keyForId(userId, id),
        ConsistentRead: true,
      }),
    );
    return result.Item as Record<string, unknown> | undefined;
  }

  protected async getCreateClaim(
    userId: string,
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    const sync = this.config.sync;
    if (!sync) return undefined;
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: ownerSyncCreateClaimPk(userId, sync.changeType, id),
          sk: syncCreateClaimSk(),
        },
      }),
    );
    return result.Item as Record<string, unknown> | undefined;
  }

  async getOrThrow(userId: string, id: string): Promise<T> {
    const entity = await this.get(userId, id);
    if (!entity) {
      throw new NotFoundError(`${this.config.conflictLabel} ${id} not found`);
    }
    return entity;
  }

  async create(entity: T): Promise<T> {
    const userId = this.config.userIdOf(entity);
    const sync = this.config.sync;
    const createHash = sync?.createPayloadHash(entity);
    const item = this.toStoredItem(entity, { createHash });
    const unique = this.config.uniqueClaim;
    const extraPuts = unique?.buildItems(entity) ?? [];

    if (!sync && extraPuts.length === 0) {
      await runDynamoWrite(
        () =>
          this.doc.send(
            new PutCommand({
              TableName: this.tableName,
              Item: item,
              ConditionExpression: 'attribute_not_exists(pk)',
            }),
          ),
        `Create conflict (${this.config.conflictLabel})`,
      );
      return entity;
    }

    const id = this.config.idOf(entity);
    const transactItems: Array<{
      Put: {
        TableName: string;
        Item: Record<string, unknown>;
        ConditionExpression?: string;
      };
    }> = [
      {
        Put: {
          TableName: this.tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ];

    if (sync) {
      transactItems.push({
        Put: {
          TableName: this.tableName,
          Item: {
            pk: ownerSyncCreateClaimPk(userId, sync.changeType, id),
            sk: syncCreateClaimSk(),
            entityType: 'syncCreateClaim',
            changeType: sync.changeType,
            entityId: id,
            userId,
            createHash,
            createdAt: entity.updatedAt,
            ttl: ttlDaysFromNow(
              SYNC_CREATE_CLAIM_TTL_DAYS,
              new Date(this.now()),
            ),
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      });
    }

    const extraStartIndex = transactItems.length;
    for (const put of extraPuts) {
      transactItems.push({
        Put: {
          TableName: this.tableName,
          Item: put.Put.Item,
          ConditionExpression:
            put.Put.ConditionExpression ?? 'attribute_not_exists(pk)',
        },
      });
    }

    const uniqueClaimIndexes =
      unique && extraPuts.length > 0
        ? unique.claimIndexes
            .filter((i) => i >= 0 && i < extraPuts.length)
            .map((i) => extraStartIndex + i)
        : undefined;

    await runDynamoWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: transactItems,
          }),
        ),
      `Create conflict (${this.config.conflictLabel})`,
      uniqueClaimIndexes
        ? {
            uniqueClaimIndexes,
            uniqueClaimCode: unique!.conflictCode,
            uniqueClaimMessage:
              unique!.conflictMessage ??
              `Create conflict (${this.config.conflictLabel})`,
          }
        : undefined,
    );
    return entity;
  }

  /**
   * Client-ULID create with owner + optional unique-claim resolution.
   * Daily-note races: first claim wins; loser returns the existing winner
   * when `uniqueClaim.resolveConflict` is configured (CHR-169).
   */
  async createIdempotent(entity: T): Promise<T> {
    const userId = this.config.userIdOf(entity);
    const id = this.config.idOf(entity);
    try {
      return await this.create(entity);
    } catch (error) {
      if (
        error instanceof ConflictError &&
        error.code !== 'conflict' &&
        this.config.uniqueClaim?.resolveConflict
      ) {
        const resolved = await this.config.uniqueClaim.resolveConflict(entity);
        // Different ULID lost the daily claim → return the first writer.
        // Same ULID falls through to createHash idempotency below.
        if (resolved && this.config.idOf(resolved) !== id) {
          this.assertOwner(userId, resolved);
          return resolved;
        }
        if (!resolved) {
          throw error;
        }
      } else if (error instanceof ConflictError && error.code !== 'conflict') {
        throw error;
      }
      if (
        !(error instanceof ConflictError) &&
        !isOptimisticLockConflict(error)
      ) {
        throw error;
      }
      const raw = await this.getRawItem(userId, id);
      if (!raw) {
        const claim = await this.getCreateClaim(userId, id);
        if (claim) {
          throw new ConflictError(
            `${this.config.conflictLabel} ${id} was deleted`,
            { code: 'deleted' },
          );
        }
        throw new ConflictError(
          `Create conflict (${this.config.conflictLabel})`,
        );
      }
      const existing = this.mapItem(raw);
      this.assertOwner(userId, existing);
      if (this.config.isDeleted?.(existing)) {
        throw new ConflictError(
          `${this.config.conflictLabel} ${id} was deleted`,
          {
            code: 'deleted',
            currentVersion: existing.version,
            current: existing,
          },
        );
      }
      const hashFn = this.config.sync?.createPayloadHash;
      if (hashFn) {
        const requestHash = hashFn(entity);
        const storedHash =
          typeof raw.createHash === 'string' ? raw.createHash : undefined;
        // Legacy rows without createHash cannot prove create-time identity
        // (hashing current state is unsafe after updates) — CHR-172.
        if (storedHash === undefined || requestHash !== storedHash) {
          throw new ConflictError(
            `${this.config.conflictLabel} ${id} already exists with a different payload`,
            {
              code: 'payload_mismatch',
              currentVersion: existing.version,
              current: existing,
            },
          );
        }
      }
      return existing;
    }
  }

  /**
   * Strongly consistent read of a live entity for a read-modify-write
   * (CHR-188). Returns the stored row too so `createHash` is preserved.
   */
  protected async readForWrite(
    userId: string,
    id: string,
  ): Promise<{ raw: Record<string, unknown>; existing: T }> {
    const raw = await this.getRawItem(userId, id);
    if (!raw) {
      throw new NotFoundError(`${this.config.conflictLabel} ${id} not found`);
    }
    const existing = this.mapItem(raw);
    this.assertOwner(userId, existing);
    if (this.config.isDeleted?.(existing)) {
      throw new NotFoundError(`${this.config.conflictLabel} ${id} not found`);
    }
    return { raw, existing };
  }

  /**
   * Versioned read-modify-write (CHR-188). `build` receives a strongly
   * consistent read, so fields the caller did not change can never revert to
   * a stale replica's values. `expected: 'any'` (If-Match `*`) resolves to the
   * version just read. The written version is always `expected + 1`, so the
   * write condition and the new version agree and no two contents share a
   * version.
   */
  async mutateIfVersion(
    userId: string,
    id: string,
    expected: number | 'any',
    build: (existing: T, now: string) => T,
  ): Promise<T> {
    const { raw, existing } = await this.readForWrite(userId, id);
    const expectedVersion = expected === 'any' ? existing.version : expected;
    const next = {
      ...build(existing, this.now()),
      version: expectedVersion + 1,
    };
    return this.putIfVersion(userId, id, expectedVersion, next, raw);
  }

  /** Soft-delete counterpart of {@link mutateIfVersion} (CHR-188). */
  async softDeleteIfVersion(
    userId: string,
    id: string,
    expected: number | 'any',
    build: (existing: T, now: string) => T,
  ): Promise<T> {
    const { existing } = await this.readForWrite(userId, id);
    const expectedVersion = expected === 'any' ? existing.version : expected;
    const tombstone = {
      ...build(existing, this.now()),
      version: expectedVersion + 1,
    };
    return this.softDelete(userId, id, expectedVersion, tombstone);
  }

  /**
   * Low-level conditional put of a caller-built entity. Prefer
   * {@link mutateIfVersion}, which builds `next` from a consistent read.
   */
  async updateIfVersion(
    userId: string,
    id: string,
    expectedVersion: number,
    next: T,
  ): Promise<T> {
    const raw = await this.getRawItem(userId, id);
    if (!raw) {
      throw new NotFoundError(`${this.config.conflictLabel} ${id} not found`);
    }
    return this.putIfVersion(userId, id, expectedVersion, next, raw);
  }

  private async putIfVersion(
    userId: string,
    id: string,
    expectedVersion: number,
    next: T,
    raw: Record<string, unknown>,
  ): Promise<T> {
    this.assertOwner(userId, next);
    const existing = this.mapItem(raw);
    this.assertOwner(userId, existing);
    const createHash =
      typeof raw.createHash === 'string' ? raw.createHash : undefined;
    await runVersionedWrite(
      () =>
        this.doc.send(
          new PutCommand({
            TableName: this.tableName,
            Item: this.toStoredItem(next, { createHash }),
            ConditionExpression: VERSION_MATCH_CONDITION,
            ExpressionAttributeValues: versionMatchValues(expectedVersion),
          }),
        ),
      `Update conflict (${this.config.conflictLabel} version)`,
      () =>
        throwVersionConflict(expectedVersion, () =>
          this.getIncludingDeleted(userId, id, { consistentRead: true }),
        ),
    );
    return next;
  }

  async softDelete(
    userId: string,
    id: string,
    expectedVersion: number,
    tombstone: T,
  ): Promise<T> {
    this.assertOwner(userId, tombstone);
    const sync = this.config.sync;
    const clock = new Date(this.now());
    const ttl = sync ? ttlDaysFromNow(undefined, clock) : undefined;
    const raw = await this.getRawItem(userId, id);
    if (!raw) {
      throw new NotFoundError(`${this.config.conflictLabel} ${id} not found`);
    }
    const existing = this.mapItem(raw);
    this.assertOwner(userId, existing);
    const createHash =
      typeof raw.createHash === 'string' ? raw.createHash : undefined;
    const claimTtl = sync
      ? ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, clock)
      : undefined;
    await runVersionedWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.tableName,
                  Item: this.toStoredItem(tombstone, { ttl, createHash }),
                  ConditionExpression: VERSION_MATCH_CONDITION,
                  ExpressionAttributeValues:
                    versionMatchValues(expectedVersion),
                },
              },
              // Extend create-claim TTL from delete time so it always outlives
              // the tombstone (CHR-172).
              ...(sync && claimTtl !== undefined
                ? [
                    {
                      Put: {
                        TableName: this.tableName,
                        Item: {
                          pk: ownerSyncCreateClaimPk(
                            userId,
                            sync.changeType,
                            id,
                          ),
                          sk: syncCreateClaimSk(),
                          entityType: 'syncCreateClaim',
                          changeType: sync.changeType,
                          entityId: id,
                          userId,
                          ...(createHash !== undefined ? { createHash } : {}),
                          createdAt: tombstone.updatedAt,
                          ttl: claimTtl,
                        },
                      },
                    },
                  ]
                : []),
            ],
          }),
        ),
      `Delete conflict (${this.config.conflictLabel} version)`,
      () =>
        throwVersionConflict(expectedVersion, () =>
          this.getIncludingDeleted(userId, id, { consistentRead: true }),
        ),
    );
    return tombstone;
  }

  async queryPage(
    input: Omit<QueryCommandInput, 'TableName' | 'ExclusiveStartKey'> & {
      cursor?: string;
      limit?: number;
      cursorKeyNames?: readonly string[];
      cursorPartition?: { attr: string; value: string };
      cursorSortBound?: { attr: string; lowerBoundInclusive: string };
    },
  ): Promise<QueryPage<T>> {
    const {
      cursor,
      limit,
      cursorKeyNames: perQueryKeys,
      cursorPartition,
      cursorSortBound,
      ...queryInput
    } = input;
    const indexName =
      typeof queryInput.IndexName === 'string'
        ? queryInput.IndexName
        : undefined;
    const cursorKeys =
      perQueryKeys ??
      (indexName ? this.config.cursorKeysByIndex?.[indexName] : undefined) ??
      this.config.cursorKeyNames ??
      PRIMARY_CURSOR_KEYS;
    const exclusiveStartKey = decodeCursor(cursor, cursorKeys);
    if (cursorPartition) {
      assertCursorMatchesQuery(exclusiveStartKey, {
        partitionAttr: cursorPartition.attr,
        partitionValue: cursorPartition.value,
        sortAttr: cursorSortBound?.attr,
        sortLowerBoundInclusive: cursorSortBound?.lowerBoundInclusive,
      });
    }
    let result;
    try {
      result = await this.doc.send(
        new QueryCommand({
          ...queryInput,
          TableName: this.tableName,
          ExclusiveStartKey: exclusiveStartKey,
          Limit: limit,
        }),
      );
    } catch (error) {
      throwCursorValidation(error);
    }
    const items: T[] = [];
    for (const raw of result.Items ?? []) {
      try {
        const entity = this.mapItem(raw);
        if (this.config.isDeleted?.(entity)) continue;
        items.push(entity);
      } catch (error) {
        if (error instanceof DataIntegrityError) {
          logCorruptStoredItem(error);
          continue;
        }
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
