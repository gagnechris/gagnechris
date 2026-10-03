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
  /** Must hash via `hashCreateFields`, never store the fields themselves. */
  createPayloadHash: (entity: T) => string;
};

export type VersionedEntityConfig<
  T extends VersionedEntity,
  TItem extends Record<string, unknown>,
> = {
  conflictLabel: string;
  keyForId: (id: string) => { pk: string; sk: string };
  idOf: (entity: T) => string;
  toEntity: (item: TItem) => T;
  toItem: (entity: T) => TItem;
  isDeleted?: (entity: T) => boolean;
  nowIso?: () => string;
  cursorKeyNames?: readonly string[];
  cursorKeysByIndex?: Readonly<Record<string, readonly string[]>>;
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

  /** `entityType` is always stamped so feed adapters work even when `toItem` omits it. */
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
        // Consistent so createHash is not dropped after a fresh create.
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
        // Rows without createHash cannot prove create-time identity
        // (hashing current state is unsafe after updates).
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

  /** The tombstone must bump version. The create claim outlives the tombstone. */
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
                  // No createHash on tombstones: a deleted id never replays,
                  // so its content fingerprint isn't kept.
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
