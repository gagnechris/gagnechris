/**
 * Optimistic-concurrency entity store. Keying and row visibility come from an
 * {@link EntityScope}: {@link unscoped} (id keys) or {@link ownerScoped}
 * (`{ userId, id }` keys).
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
  syncCreateClaimPk,
  syncCreateClaimSk,
  syncPk,
  syncSk,
  SYNC_CREATE_CLAIM_TTL_DAYS,
  ttlDaysFromNow,
} from '@gagnechris/data';
import { ZodError } from 'zod';
import { getDocClient, requireTableName } from './client.js';
import { systemClock, type Clock } from './clock.js';
import { logCorruptStoredItem } from './corrupt-item.js';
import { createHashMatches } from './create-hash.js';
import {
  assertCursorMatchesQuery,
  decodeCursor,
  encodeCursor,
  PRIMARY_CURSOR_KEYS,
} from './cursor.js';
import { throwCursorValidation } from './dynamo-errors.js';
import { isTransactionConflict, runDynamoWrite } from './dynamo-write.js';
import { cursorKeyOf, jsonByteLength } from './page-budget.js';
import { ConflictError, DataIntegrityError, NotFoundError } from './errors.js';
import {
  VERSION_MATCH_CONDITION,
  runVersionedWrite,
  throwVersionConflict,
  versionMatchValues,
} from './version-condition.js';

export type VersionedEntity = {
  version: number;
  updatedAt: string;
};

export type ItemKey = { pk: string; sk: string };

export type OwnerKey = { userId: string; id: string };

export type EntityScope<T, TKey> = {
  idOf: (entity: T) => string;
  keyOf: (entity: T) => TKey;
  idOfKey: (key: TKey) => string;
  itemKey: (key: TKey) => ItemKey;
  /** False makes the row read as missing for this key. */
  owns: (key: TKey, entity: T) => boolean;
  createClaim: (
    changeType: string,
    key: TKey,
  ) => ItemKey & Record<string, unknown>;
  /** Attributes removed from tombstones so list indexes drop the row. */
  tombstoneOmits: readonly string[];
};

export function unscoped<T>(opts: {
  keyForId: (id: string) => ItemKey;
  idOf: (entity: T) => string;
}): EntityScope<T, string> {
  return {
    idOf: opts.idOf,
    keyOf: opts.idOf,
    idOfKey: (id) => id,
    itemKey: opts.keyForId,
    owns: () => true,
    createClaim: (changeType, id) => ({
      pk: syncCreateClaimPk(changeType, id),
      sk: syncCreateClaimSk(),
    }),
    tombstoneOmits: [],
  };
}

const LIST_GSI_KEYS = ['gsi1pk', 'gsi1sk', 'gsi2pk', 'gsi2sk'] as const;

/** Another owner's rows read as missing; tombstones drop list GSI keys so lists skip them. */
export function ownerScoped<T>(opts: {
  keyForId: (userId: string, id: string) => ItemKey;
  idOf: (entity: T) => string;
  userIdOf: (entity: T) => string;
}): EntityScope<T, OwnerKey> {
  return {
    idOf: opts.idOf,
    keyOf: (entity) => ({
      userId: opts.userIdOf(entity),
      id: opts.idOf(entity),
    }),
    idOfKey: (key) => key.id,
    itemKey: (key) => opts.keyForId(key.userId, key.id),
    owns: (key, entity) => opts.userIdOf(entity) === key.userId,
    createClaim: (changeType, key) => ({
      pk: ownerSyncCreateClaimPk(key.userId, changeType, key.id),
      sk: syncCreateClaimSk(),
      userId: key.userId,
    }),
    tombstoneOmits: LIST_GSI_KEYS,
  };
}

export type SyncEntityConfig<T extends VersionedEntity> = {
  changeType: string;
  userIdOf: (entity: T) => string;
  /**
   * `hashCreateFields` digest (never the raw fields). A create retry with the
   * same id but a different hash is a 409 `payload_mismatch`.
   */
  createPayloadHash: (entity: T) => string;
};

export const CREATE_TRANSACTION_CONFLICT_RETRIES = 4;

/** Full jitter on 20, 40, 80, 160 ms so racing losers spread out. */
function transactionConflictBackoffMs(attempt: number): number {
  return Math.random() * 20 * 2 ** attempt;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export type UniqueClaimHook<T extends VersionedEntity> = {
  buildItems: (entity: T) => Array<{
    Put: {
      Item: Record<string, unknown>;
      ConditionExpression?: string;
    };
  }>;
  claimIndexes: readonly number[];
  conflictCode: 'slug_taken' | 'daily_taken';
  conflictMessage?: string;
  /** Holder of a conflicting claim; `undefined` rethrows the conflict. */
  resolveConflict?: (entity: T) => Promise<T | undefined>;
  /** Deletes that free the claim on soft delete; condition them on the claim still pointing at `entity`. */
  releaseItems?: (entity: T) => Array<{
    Delete: {
      Key: Record<string, unknown>;
      ConditionExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    };
  }>;
  /** Frees a claim still held by a tombstone; the create is then retried once. */
  releaseStale?: (holder: T) => Promise<void>;
  /** Frees a claim whose holder row is gone; the create is then retried once. */
  releaseOrphan?: (entity: T) => Promise<void>;
};

export type VersionedRepositoryConfig<
  T extends VersionedEntity,
  TItem extends Record<string, unknown>,
  TKey,
> = {
  conflictLabel: string;
  scope: EntityScope<T, TKey>;
  toEntity: (item: TItem) => T;
  toItem: (entity: T) => TItem;
  isDeleted?: (entity: T) => boolean;
  nowIso?: Clock;
  cursorKeyNames?: readonly string[];
  cursorKeysByIndex?: Readonly<Record<string, readonly string[]>>;
  sync?: SyncEntityConfig<T>;
  uniqueClaim?: UniqueClaimHook<T>;
};

export type QueryPage<T> = {
  items: T[];
  nextCursor?: string;
};

export type QueryPageInput = Omit<
  QueryCommandInput,
  'TableName' | 'ExclusiveStartKey'
> & {
  cursor?: string;
  limit?: number;
  cursorKeyNames?: readonly string[];
  /** Rejects cursors from another partition. */
  cursorPartition?: { attr: string; value: string };
  /** Rejects cursors below the range's lower bound. */
  cursorSortBound?: { attr: string; lowerBoundInclusive: string };
  /** JSON bytes of returned items; the first item is always returned. */
  byteBudget?: number;
};

type ReadOpts = { consistentRead?: boolean };

export class VersionedRepository<
  T extends VersionedEntity,
  TItem extends Record<string, unknown>,
  TKey,
> {
  constructor(
    protected readonly config: VersionedRepositoryConfig<T, TItem, TKey>,
    protected readonly doc: DynamoDBDocumentClient = getDocClient(),
    protected readonly tableName: string = requireTableName(),
  ) {}

  protected get scope(): EntityScope<T, TKey> {
    return this.config.scope;
  }

  protected now(): string {
    return (this.config.nowIso ?? systemClock)();
  }

  protected notFound(key: TKey): NotFoundError {
    return new NotFoundError(
      `${this.config.conflictLabel} ${this.scope.idOfKey(key)} not found`,
    );
  }

  /** Zod failures become DataIntegrityError (500), never a client 400. */
  mapItem(raw: unknown): T {
    return this.mapWith(raw, (item) => this.config.toEntity(item as TItem));
  }

  mapWith<R>(raw: unknown, parse: (raw: unknown) => R): R {
    try {
      return parse(raw);
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

  protected assertOwns(key: TKey, entity: T): void {
    if (!this.scope.owns(key, entity)) {
      throw new NotFoundError(
        `${this.config.conflictLabel} ${this.scope.idOf(entity)} not found`,
      );
    }
  }

  /** `entityType` is stamped here so feed adapters work even when `toItem` omits it. */
  protected toStoredItem(
    entity: T,
    opts?: { ttl?: number; createHash?: string },
  ): TItem {
    const base: Record<string, unknown> = { ...this.config.toItem(entity) };
    if (this.config.isDeleted?.(entity)) {
      for (const attr of this.scope.tombstoneOmits) delete base[attr];
    }
    const sync = this.config.sync;
    const syncAttrs = sync
      ? {
          entityType: sync.changeType,
          syncPk: syncPk(sync.userIdOf(entity)),
          syncSk: syncSk(
            entity.updatedAt,
            sync.changeType,
            this.scope.idOf(entity),
          ),
        }
      : {};
    return {
      ...base,
      ...syncAttrs,
      ...(opts?.ttl !== undefined ? { ttl: opts.ttl } : {}),
      ...(opts?.createHash !== undefined
        ? { createHash: opts.createHash }
        : {}),
    } as TItem;
  }

  private async readItem(key: TKey, opts?: ReadOpts): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.scope.itemKey(key),
        ...(opts?.consistentRead ? { ConsistentRead: true } : {}),
      }),
    );
    if (!result.Item) return undefined;
    const entity = this.mapItem(result.Item);
    if (!this.scope.owns(key, entity)) return undefined;
    return entity;
  }

  async get(key: TKey, opts?: ReadOpts): Promise<T | undefined> {
    const entity = await this.readItem(key, opts);
    if (!entity || this.config.isDeleted?.(entity)) return undefined;
    return entity;
  }

  getIncludingDeleted(key: TKey, opts?: ReadOpts): Promise<T | undefined> {
    return this.readItem(key, opts);
  }

  async getOrThrow(key: TKey): Promise<T> {
    const entity = await this.get(key);
    if (!entity) throw this.notFound(key);
    return entity;
  }

  protected async getRawItem(
    key: TKey,
  ): Promise<Record<string, unknown> | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.scope.itemKey(key),
        // Consistent so createHash is not dropped after a fresh create.
        ConsistentRead: true,
      }),
    );
    return result.Item as Record<string, unknown> | undefined;
  }

  protected async getCreateClaim(
    key: TKey,
  ): Promise<Record<string, unknown> | undefined> {
    const sync = this.config.sync;
    if (!sync) return undefined;
    const { pk, sk } = this.scope.createClaim(sync.changeType, key);
    const result = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk, sk } }),
    );
    return result.Item as Record<string, unknown> | undefined;
  }

  private createClaimItem(
    sync: SyncEntityConfig<T>,
    key: TKey,
    createdAt: string,
    ttl: number,
  ): Record<string, unknown> {
    return {
      ...this.scope.createClaim(sync.changeType, key),
      entityType: 'syncCreateClaim',
      changeType: sync.changeType,
      entityId: this.scope.idOfKey(key),
      createdAt,
      ttl,
    };
  }

  async create(entity: T): Promise<T> {
    const sync = this.config.sync;
    const createHash = sync?.createPayloadHash(entity);
    const item = this.toStoredItem(entity, { createHash });
    const unique = this.config.uniqueClaim;
    const extraPuts = unique?.buildItems(entity) ?? [];
    const conflictMessage = `Create conflict (${this.config.conflictLabel})`;

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
        conflictMessage,
      );
      return entity;
    }

    const puts: Array<{
      Item: Record<string, unknown>;
      ConditionExpression: string;
    }> = [{ Item: item, ConditionExpression: 'attribute_not_exists(pk)' }];
    if (sync) {
      puts.push({
        Item: this.createClaimItem(
          sync,
          this.scope.keyOf(entity),
          entity.updatedAt,
          ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, new Date(this.now())),
        ),
        ConditionExpression: 'attribute_not_exists(pk)',
      });
    }
    const extraStartIndex = puts.length;
    for (const put of extraPuts) {
      puts.push({
        Item: put.Put.Item,
        ConditionExpression:
          put.Put.ConditionExpression ?? 'attribute_not_exists(pk)',
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
            TransactItems: puts.map((put) => ({
              Put: { TableName: this.tableName, ...put },
            })),
          }),
        ),
      conflictMessage,
      unique && uniqueClaimIndexes
        ? {
            uniqueClaimIndexes,
            uniqueClaimCode: unique.conflictCode,
            uniqueClaimMessage: unique.conflictMessage ?? conflictMessage,
          }
        : undefined,
    );
    return entity;
  }

  /**
   * Client-ULID create. A retry with the same id and createHash returns the
   * stored entity; the create claim keeps a deleted id from being reused
   * after the META row's TTL purge.
   */
  async createIdempotent(
    entity: T,
    retried = false,
    transactionConflicts = 0,
  ): Promise<T> {
    const key = this.scope.keyOf(entity);
    const id = this.scope.idOf(entity);
    const label = this.config.conflictLabel;
    try {
      return await this.create(entity);
    } catch (error) {
      const unique = this.config.uniqueClaim;
      // Concurrent creates of one claim cancel each other with
      // TransactionConflict on real DynamoDB (never on DynamoDB Local). Once
      // the winner commits the loser can name it; until then, back off.
      if (
        error instanceof ConflictError &&
        error.code === 'conflict' &&
        isTransactionConflict(error.cause)
      ) {
        const holder = await unique?.resolveConflict?.(entity);
        if (
          unique &&
          holder &&
          this.scope.idOf(holder) !== id &&
          !this.config.isDeleted?.(holder)
        ) {
          this.assertOwns(key, holder);
          throw new ConflictError(
            unique.conflictMessage ?? `Create conflict (${label})`,
            {
              code: unique.conflictCode,
              currentVersion: holder.version,
              current: holder,
            },
          );
        }
        if (transactionConflicts < CREATE_TRANSACTION_CONFLICT_RETRIES) {
          await sleep(transactionConflictBackoffMs(transactionConflicts));
          return this.createIdempotent(
            entity,
            retried,
            transactionConflicts + 1,
          );
        }
      }
      if (
        error instanceof ConflictError &&
        error.code !== 'conflict' &&
        unique?.resolveConflict
      ) {
        const resolved = await unique.resolveConflict(entity);
        if (resolved && this.scope.idOf(resolved) !== id) {
          this.assertOwns(key, resolved);
          // A tombstone still holding the claim: free it and retry once.
          if (
            this.config.isDeleted?.(resolved) &&
            unique.releaseStale &&
            !retried
          ) {
            await unique.releaseStale(resolved);
            return this.createIdempotent(entity, true, transactionConflicts);
          }
          // Return the winner so the client can merge rather than drop its write.
          throw new ConflictError(
            unique.conflictMessage ?? `Create conflict (${label})`,
            {
              code: unique.conflictCode,
              currentVersion: resolved.version,
              current: resolved,
            },
          );
        }
        // Same ULID falls through to createHash idempotency below.
        if (!resolved) {
          if (!retried && unique.releaseOrphan) {
            await unique.releaseOrphan(entity);
            return this.createIdempotent(entity, true, transactionConflicts);
          }
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
      const raw = await this.getRawItem(key);
      if (!raw) {
        const claim = await this.getCreateClaim(key);
        if (claim) {
          throw new ConflictError(`${label} ${id} was deleted`, {
            code: 'deleted',
          });
        }
        throw new ConflictError(`Create conflict (${label})`);
      }
      const existing = this.mapItem(raw);
      this.assertOwns(key, existing);
      if (this.config.isDeleted?.(existing)) {
        throw new ConflictError(`${label} ${id} was deleted`, {
          code: 'deleted',
          currentVersion: existing.version,
          current: existing,
        });
      }
      const hashFn = this.config.sync?.createPayloadHash;
      if (hashFn) {
        const storedHash =
          typeof raw.createHash === 'string' ? raw.createHash : undefined;
        // Legacy rows without createHash cannot prove create-time identity
        // (hashing current state is unsafe after updates).
        if (!createHashMatches(storedHash, hashFn(entity))) {
          throw new ConflictError(
            `${label} ${id} already exists with a different payload`,
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

  /** Raw row is returned too so `createHash` survives the rewrite. */
  protected async readForWrite(
    key: TKey,
    opts: { allowDeleted: boolean },
  ): Promise<{ raw: Record<string, unknown>; existing: T }> {
    const raw = await this.getRawItem(key);
    if (!raw) throw this.notFound(key);
    const existing = this.mapItem(raw);
    this.assertOwns(key, existing);
    if (!opts.allowDeleted && this.config.isDeleted?.(existing)) {
      throw this.notFound(key);
    }
    return { raw, existing };
  }

  /**
   * `build` gets a strongly consistent read so untouched fields cannot revert
   * to a stale replica's values. The written version is always
   * `expected + 1` so no two contents share a version; `'any'` (If-Match `*`)
   * means the version just read.
   */
  async mutateIfVersion(
    key: TKey,
    expected: number | 'any',
    build: (existing: T, now: string) => T,
  ): Promise<T> {
    const { raw, existing } = await this.readForWrite(key, {
      allowDeleted: false,
    });
    const expectedVersion = expected === 'any' ? existing.version : expected;
    const next = {
      ...build(existing, this.now()),
      version: expectedVersion + 1,
    };
    return this.putIfVersion(key, expectedVersion, next, raw);
  }

  async softDeleteIfVersion(
    key: TKey,
    expected: number | 'any',
    build: (existing: T, now: string) => T,
  ): Promise<T> {
    const { existing } = await this.readForWrite(key, {
      allowDeleted: false,
    });
    const expectedVersion = expected === 'any' ? existing.version : expected;
    const tombstone = {
      ...build(existing, this.now()),
      version: expectedVersion + 1,
    };
    return this.softDelete(key, expectedVersion, tombstone);
  }

  private async putIfVersion(
    key: TKey,
    expectedVersion: number,
    next: T,
    raw: Record<string, unknown>,
  ): Promise<T> {
    this.assertOwns(key, next);
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
          this.getIncludingDeleted(key, { consistentRead: true }),
        ),
    );
    return next;
  }

  /** Prefer {@link softDeleteIfVersion}. With sync, the tombstone gets a TTL. */
  async softDelete(
    key: TKey,
    expectedVersion: number,
    tombstone: T,
  ): Promise<T> {
    this.assertOwns(key, tombstone);
    const sync = this.config.sync;
    const clock = new Date(this.now());
    const ttl = sync ? ttlDaysFromNow(undefined, clock) : undefined;
    const { existing } = await this.readForWrite(key, { allowDeleted: true });
    await runVersionedWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.tableName,
                  // No createHash on tombstones: a deleted id never replays,
                  // so its content fingerprint isn't kept.
                  Item: this.toStoredItem(tombstone, { ttl }),
                  ConditionExpression: VERSION_MATCH_CONDITION,
                  ExpressionAttributeValues:
                    versionMatchValues(expectedVersion),
                },
              },
              // Extend create-claim TTL from delete time so it always outlives
              // the tombstone.
              ...(sync
                ? [
                    {
                      Put: {
                        TableName: this.tableName,
                        Item: this.createClaimItem(
                          sync,
                          key,
                          tombstone.updatedAt,
                          ttlDaysFromNow(SYNC_CREATE_CLAIM_TTL_DAYS, clock),
                        ),
                      },
                    },
                  ]
                : []),
              ...(this.config.uniqueClaim?.releaseItems?.(existing) ?? []).map(
                (item) => ({
                  Delete: { TableName: this.tableName, ...item.Delete },
                }),
              ),
            ],
          }),
        ),
      `Delete conflict (${this.config.conflictLabel} version)`,
      () =>
        throwVersionConflict(expectedVersion, () =>
          this.getIncludingDeleted(key, { consistentRead: true }),
        ),
    );
    return tombstone;
  }

  queryPage(input: QueryPageInput): Promise<QueryPage<T>> {
    return this.queryPageAs(
      input,
      (raw) => this.mapItem(raw),
      this.config.isDeleted,
    );
  }

  /** `mapRow` must throw DataIntegrityError for corrupt rows (see {@link mapWith}); they are logged and skipped. */
  async queryPageAs<R>(
    input: QueryPageInput,
    mapRow: (raw: unknown) => R,
    isDeleted?: (row: R) => boolean,
  ): Promise<QueryPage<R>> {
    const {
      cursor,
      limit,
      cursorKeyNames: perQueryKeys,
      cursorPartition,
      cursorSortBound,
      byteBudget,
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
    const items: R[] = [];
    const rows = (result.Items ?? []) as Record<string, unknown>[];
    let bytes = 0;
    for (const [index, raw] of rows.entries()) {
      let entity: R;
      try {
        entity = mapRow(raw);
      } catch (error) {
        if (error instanceof DataIntegrityError) {
          logCorruptStoredItem(error);
          continue;
        }
        throw error;
      }
      if (isDeleted?.(entity)) continue;
      if (byteBudget !== undefined) {
        const size = jsonByteLength(entity);
        if (items.length > 0 && bytes + size > byteBudget) {
          return {
            items,
            nextCursor: encodeCursor(cursorKeyOf(rows[index - 1]!, cursorKeys)),
          };
        }
        bytes += size;
      }
      items.push(entity);
    }
    return {
      items,
      nextCursor: encodeCursor(
        result.LastEvaluatedKey as Record<string, unknown> | undefined,
      ),
    };
  }
}
