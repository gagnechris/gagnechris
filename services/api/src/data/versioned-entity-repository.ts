/**
 * Generic optimistic-concurrency entity store (CHR-129 / CHR-153 / CHR-161 / CHR-162).
 * Optional sync config writes sparse GSI keys on META (one row per entity).
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
  syncCreateClaimPk,
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
import { createHashMatches } from './create-hash.js';

export { VERSION_MATCH_CONDITION } from './version-condition.js';

export type VersionedEntity = {
  version: number;
  updatedAt: string;
};

export type SyncEntityConfig<T extends VersionedEntity> = {
  /** Stable change-feed type (e.g. `fakeNote`). Stored as `entityType` on META. */
  changeType: string;
  userIdOf: (entity: T) => string;
  /**
   * Hash of create payload fields (`sha256:…` via `hashCreateFields`, never
   * the fields themselves; CHR-192). Stored as `createHash` on the live META
   * row only.
   * Retries with the same id but a different hash throw ConflictError (409);
   * matching hash is idempotent. Required when sync is configured (CHR-162).
   */
  createPayloadHash: (entity: T) => string;
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
   * Per-index cursor key sets (CHR-169). Used when `queryPage` omits
   * `cursorKeyNames` but sets `IndexName`.
   */
  cursorKeysByIndex?: Readonly<Record<string, readonly string[]>>;
  /**
   * When set, every write stamps `entityType` + `syncPk` / `syncSk` on the META
   * item so the sparse sync GSI returns one latest row per entity (CHR-153).
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

  /**
   * Attach sparse sync GSI keys + entityType when sync is configured.
   * `entityType` is always stamped from `sync.changeType` so feed adapters work
   * even when `toItem` omits it (CHR-162).
   */
  protected toStoredItem(
    entity: T,
    opts?: { ttl?: number; createHash?: string },
  ): TItem {
    const base = this.config.toItem(entity);
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
    id: string,
    opts?: { consistentRead?: boolean },
  ): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.config.keyForId(id),
        ...(opts?.consistentRead ? { ConsistentRead: true } : {}),
      }),
    );
    if (!result.Item) return undefined;
    const entity = this.mapItem(result.Item);
    if (this.config.isDeleted?.(entity)) return undefined;
    return entity;
  }

  /** Like get, but returns soft-deleted entities (for idempotent-create / conflicts). */
  async getIncludingDeleted(
    id: string,
    opts?: { consistentRead?: boolean },
  ): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.config.keyForId(id),
        ...(opts?.consistentRead ? { ConsistentRead: true } : {}),
      }),
    );
    if (!result.Item) return undefined;
    return this.mapItem(result.Item);
  }

  protected async getRawItem(
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.config.keyForId(id),
        // Consistent so createHash is not dropped after a fresh create (CHR-170).
        ConsistentRead: true,
      }),
    );
    return result.Item as Record<string, unknown> | undefined;
  }

  protected async getCreateClaim(
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    const sync = this.config.sync;
    if (!sync) return undefined;
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: syncCreateClaimPk(sync.changeType, id),
          sk: syncCreateClaimSk(),
        },
      }),
    );
    return result.Item as Record<string, unknown> | undefined;
  }

  async getOrThrow(id: string): Promise<T> {
    const entity = await this.get(id);
    if (!entity) {
      throw new NotFoundError(`${this.config.conflictLabel} ${id} not found`);
    }
    return entity;
  }

  async create(entity: T): Promise<T> {
    const sync = this.config.sync;
    const createHash = sync?.createPayloadHash(entity);
    const item = this.toStoredItem(entity, {
      createHash,
    });

    if (!sync) {
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
    const claimKey = {
      pk: syncCreateClaimPk(sync.changeType, id),
      sk: syncCreateClaimSk(),
    };
    await runDynamoWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.tableName,
                  Item: item,
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
              {
                Put: {
                  TableName: this.tableName,
                  Item: {
                    ...claimKey,
                    entityType: 'syncCreateClaim',
                    changeType: sync.changeType,
                    entityId: id,
                    createdAt: entity.updatedAt,
                    ttl: ttlDaysFromNow(
                      SYNC_CREATE_CLAIM_TTL_DAYS,
                      new Date(this.now()),
                    ),
                  },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
            ],
          }),
        ),
      `Create conflict (${this.config.conflictLabel})`,
    );
    return entity;
  }

  /**
   * Client-ULID create: retries with the same id are idempotent when the
   * stored createHash matches; mismatch, tombstone, or create-claim after
   * META TTL purge → ConflictError (CHR-162).
   */
  async createIdempotent(entity: T): Promise<T> {
    const id = this.config.idOf(entity);
    try {
      return await this.create(entity);
    } catch (error) {
      if (
        !(error instanceof ConflictError) &&
        !isOptimisticLockConflict(error)
      ) {
        throw error;
      }
      const raw = await this.getRawItem(id);
      if (!raw) {
        const claim = await this.getCreateClaim(id);
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
        if (!createHashMatches(storedHash, requestHash)) {
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
   * Replace the item when `expectedVersion` matches. Throws ConflictError with
   * `current` / `currentVersion` when the condition fails.
   */
  async updateIfVersion(
    id: string,
    expectedVersion: number,
    next: T,
  ): Promise<T> {
    const raw = await this.getRawItem(id);
    const createHash =
      typeof raw?.createHash === 'string' ? raw.createHash : undefined;
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
          this.getIncludingDeleted(id, { consistentRead: true }),
        ),
    );
    return next;
  }

  /**
   * Soft-delete via caller-supplied tombstone entity (must bump version).
   * Sets DynamoDB TTL when sync is configured so the GSI row expires with META.
   * The create claim outlives the tombstone (CHR-162).
   */
  async softDelete(
    id: string,
    expectedVersion: number,
    tombstone: T,
  ): Promise<T> {
    const sync = this.config.sync;
    const clock = new Date(this.now());
    const ttl = sync ? ttlDaysFromNow(undefined, clock) : undefined;
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
                  // No createHash on tombstones: a deleted id never replays
                  // (CHR-192), so its content fingerprint isn't kept.
                  Item: this.toStoredItem(tombstone, { ttl }),
                  ConditionExpression: VERSION_MATCH_CONDITION,
                  ExpressionAttributeValues:
                    versionMatchValues(expectedVersion),
                },
              },
              ...(sync && claimTtl !== undefined
                ? [
                    {
                      Put: {
                        TableName: this.tableName,
                        Item: {
                          pk: syncCreateClaimPk(sync.changeType, id),
                          sk: syncCreateClaimSk(),
                          entityType: 'syncCreateClaim',
                          changeType: sync.changeType,
                          entityId: id,
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
          this.getIncludingDeleted(id, { consistentRead: true }),
        ),
    );
    return tombstone;
  }

  /**
   * Query with opaque cursor pagination (follows LastEvaluatedKey).
   * Prefer per-call `cursorKeyNames` (or `cursorKeysByIndex[IndexName]`) when
   * a repository queries more than one index (CHR-169).
   */
  async queryPage(
    input: Omit<QueryCommandInput, 'TableName' | 'ExclusiveStartKey'> & {
      cursor?: string;
      limit?: number;
      /** Override cursor key set for this query (takes precedence). */
      cursorKeyNames?: readonly string[];
      /** Bind cursor to the queried partition (CHR-170). */
      cursorPartition?: { attr: string; value: string };
      /** Bind cursor sort key to a range lower bound (CHR-170). */
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
