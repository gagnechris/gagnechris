/**
 * Publishable layer on VersionedEntityRepository (CHR-129 / CHR-152).
 * One publish/unpublish/discard implementation for keyed + singleton entities.
 */
import {
  BatchGetCommand,
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  batchGetAllWithDocClient,
  isOptimisticLockConflict,
} from '@gagnechris/data';
import { getDocClient, requireTableName } from './client.js';
import { runDynamoWrite } from './dynamo-write.js';
import { ConflictError, NotFoundError } from './errors.js';
import {
  VersionedEntityRepository,
  type VersionedEntityConfig,
} from './versioned-entity-repository.js';

export type PublishableEntity = {
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  version: number;
  hasUnpublishedChanges?: boolean;
};

export type PublishKeys = {
  pk: string;
  metaSk: string;
  publishedSk: string;
};

export const nowIso = (): string => new Date().toISOString();

export function withUnpublishedFlag<T extends PublishableEntity>(
  draft: T,
  published: T | undefined,
  contentEqual: (a: T, b: T) => boolean,
): T {
  return {
    ...draft,
    hasUnpublishedChanges:
      draft.status === 'published' &&
      published !== undefined &&
      !contentEqual(draft, published),
  };
}

export function assertExpectedVersion<T extends PublishableEntity>(
  existing: T,
  expectedVersion: number,
): void {
  if (existing.version !== expectedVersion) {
    throw new ConflictError(
      `Version conflict: expected ${expectedVersion}, current ${existing.version}`,
      { currentVersion: existing.version, current: existing },
    );
  }
}

export function nextPublishedState<T extends PublishableEntity>(
  existing: T,
  opts?: { publishedAt?: string },
): T {
  const updatedAt = nowIso();
  return {
    ...existing,
    status: 'published',
    publishedAt: existing.publishedAt ?? opts?.publishedAt ?? updatedAt,
    updatedAt,
    version: existing.version + 1,
    hasUnpublishedChanges: false,
  };
}

export function nextUnpublishedState<T extends PublishableEntity>(
  existing: T,
): T {
  return {
    ...existing,
    status: 'draft',
    updatedAt: nowIso(),
    version: existing.version + 1,
    hasUnpublishedChanges: false,
  };
}

export function nextDiscardState<T extends PublishableEntity>(
  existing: T,
  published: T,
): T {
  return {
    ...published,
    status: 'published',
    publishedAt: existing.publishedAt ?? published.publishedAt,
    updatedAt: nowIso(),
    version: existing.version + 1,
    hasUnpublishedChanges: false,
  };
}

export type PublishableConfig<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
> = {
  conflictLabel: string;
  keysFor: (id: string) => PublishKeys;
  idOf: (entity: T) => string;
  toEntity: (item: TItem, hasUnpublishedChanges?: boolean) => T;
  toItem: (entity: T) => TItem;
  toPublishedItem: (entity: T) => TItem;
  contentEqual: (a: T, b: T) => boolean;
  isDeleted?: (entity: T) => boolean;
  nowIso?: () => string;
  cursorKeyNames?: readonly string[];
};

export type PersistPublishOptions<T extends PublishableEntity> = {
  syncPublished?: boolean;
  deletePublished?: boolean;
  previousPublished?: T;
};

type LoadedPair<T> = { draft: T; published: T | undefined };

export class PublishableRepository<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
> extends VersionedEntityRepository<T, TItem> {
  protected readonly publishConfig: PublishableConfig<T, TItem>;

  constructor(
    config: PublishableConfig<T, TItem>,
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
  ) {
    const versioned: VersionedEntityConfig<T, TItem> = {
      conflictLabel: config.conflictLabel,
      keyForId: (id) => {
        const keys = config.keysFor(id);
        return { pk: keys.pk, sk: keys.metaSk };
      },
      idOf: config.idOf,
      toEntity: (item) => config.toEntity(item),
      toItem: config.toItem,
      isDeleted: config.isDeleted,
      nowIso: config.nowIso,
      cursorKeyNames: config.cursorKeyNames,
    };
    super(versioned, doc, tableName);
    this.publishConfig = config;
  }

  async getPublished(id: string): Promise<T | undefined> {
    const keys = this.publishConfig.keysFor(id);
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: keys.pk, sk: keys.publishedSk },
      }),
    );
    if (!result.Item) return undefined;
    return this.publishConfig.toEntity(result.Item as TItem, false);
  }

  async loadDraftAndPublished(id: string): Promise<LoadedPair<T> | undefined> {
    const keys = this.publishConfig.keysFor(id);
    const responses = await batchGetAllWithDocClient(
      async (RequestItems) =>
        this.doc.send(new BatchGetCommand({ RequestItems })),
      {
        [this.tableName]: {
          Keys: [
            { pk: keys.pk, sk: keys.metaSk },
            { pk: keys.pk, sk: keys.publishedSk },
          ],
        },
      },
    );
    const items = responses[this.tableName] ?? [];
    let draftItem: TItem | undefined;
    let publishedItem: TItem | undefined;
    for (const item of items) {
      const sk = (item as { sk?: string }).sk;
      if (sk === keys.metaSk) draftItem = item as TItem;
      if (sk === keys.publishedSk) publishedItem = item as TItem;
    }
    if (!draftItem) return undefined;

    const draft = this.mapItem(draftItem);
    if (this.publishConfig.isDeleted?.(draft)) return undefined;

    const published = publishedItem
      ? this.publishConfig.toEntity(publishedItem, false)
      : undefined;

    return { draft, published };
  }

  async getById(id: string): Promise<T | undefined> {
    const loaded = await this.loadDraftAndPublished(id);
    if (!loaded) return undefined;
    return withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      this.publishConfig.contentEqual,
    );
  }

  async getByIdOrThrow(id: string): Promise<T> {
    const entity = await this.getById(id);
    if (!entity) {
      throw new NotFoundError(
        `${this.publishConfig.conflictLabel} ${id} not found`,
      );
    }
    return entity;
  }

  async persistMutation(
    before: T,
    after: T,
    options: PersistPublishOptions<T>,
  ): Promise<void> {
    const id = this.publishConfig.idOf(after);
    const keys = this.publishConfig.keysFor(id);
    try {
      if (options.syncPublished) {
        await runDynamoWrite(
          () =>
            this.doc.send(
              new TransactWriteCommand({
                TransactItems: [
                  {
                    Put: {
                      TableName: this.tableName,
                      Item: this.publishConfig.toItem(after),
                      ConditionExpression:
                        'attribute_not_exists(version) OR version = :v',
                      ExpressionAttributeValues: { ':v': before.version },
                    },
                  },
                  {
                    Put: {
                      TableName: this.tableName,
                      Item: this.publishConfig.toPublishedItem(after),
                    },
                  },
                ],
              }),
            ),
          `Publish conflict (${this.publishConfig.conflictLabel} version)`,
        );
        return;
      }
      if (options.deletePublished) {
        await runDynamoWrite(
          () =>
            this.doc.send(
              new TransactWriteCommand({
                TransactItems: [
                  {
                    Put: {
                      TableName: this.tableName,
                      Item: this.publishConfig.toItem(after),
                      ConditionExpression:
                        'attribute_not_exists(version) OR version = :v',
                      ExpressionAttributeValues: { ':v': before.version },
                    },
                  },
                  {
                    Delete: {
                      TableName: this.tableName,
                      Key: { pk: keys.pk, sk: keys.publishedSk },
                    },
                  },
                ],
              }),
            ),
          `Unpublish conflict (${this.publishConfig.conflictLabel} version)`,
        );
        return;
      }
      await runDynamoWrite(
        () =>
          this.doc.send(
            new PutCommand({
              TableName: this.tableName,
              Item: this.publishConfig.toItem(after),
              ConditionExpression:
                'attribute_not_exists(version) OR version = :v',
              ExpressionAttributeValues: { ':v': before.version },
            }),
          ),
        `Update conflict (${this.publishConfig.conflictLabel} version)`,
      );
    } catch (error) {
      if (error instanceof ConflictError || isOptimisticLockConflict(error)) {
        if (error instanceof ConflictError && error.code === 'slug_taken') {
          throw error;
        }
        const current = await this.getById(id);
        throw new ConflictError(
          `Version conflict: expected ${before.version}, current ${current?.version ?? 'unknown'}`,
          {
            currentVersion: current?.version,
            current,
          },
        );
      }
      throw error;
    }
  }

  async publish(
    id: string,
    options?: { publishedAt?: string; version?: number },
  ): Promise<T> {
    const loaded = await this.loadDraftAndPublished(id);
    if (!loaded) {
      throw new NotFoundError(
        `${this.publishConfig.conflictLabel} ${id} not found`,
      );
    }
    const existing = withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      this.publishConfig.contentEqual,
    );
    if (options?.version !== undefined) {
      assertExpectedVersion(existing, options.version);
    }
    const published = loaded.published;
    if (
      existing.status === 'published' &&
      published &&
      this.publishConfig.contentEqual(existing, published)
    ) {
      return withUnpublishedFlag(
        existing,
        published,
        this.publishConfig.contentEqual,
      );
    }
    const next = nextPublishedState(existing, {
      publishedAt: options?.publishedAt,
    });
    await this.persistMutation(existing, next, {
      syncPublished: true,
      previousPublished: published,
    });
    return withUnpublishedFlag(next, next, this.publishConfig.contentEqual);
  }

  async unpublish(id: string, expectedVersion?: number): Promise<T> {
    const loaded = await this.loadDraftAndPublished(id);
    if (!loaded) {
      throw new NotFoundError(
        `${this.publishConfig.conflictLabel} ${id} not found`,
      );
    }
    const existing = withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      this.publishConfig.contentEqual,
    );
    if (expectedVersion !== undefined) {
      assertExpectedVersion(existing, expectedVersion);
    }
    if (existing.status !== 'published') {
      return withUnpublishedFlag(
        existing,
        undefined,
        this.publishConfig.contentEqual,
      );
    }
    const next = nextUnpublishedState(existing);
    await this.persistMutation(existing, next, {
      deletePublished: true,
      previousPublished: loaded.published,
    });
    return next;
  }

  async discard(id: string, expectedVersion?: number): Promise<T> {
    const loaded = await this.loadDraftAndPublished(id);
    if (!loaded) {
      throw new NotFoundError(
        `${this.publishConfig.conflictLabel} ${id} not found`,
      );
    }
    const existing = withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      this.publishConfig.contentEqual,
    );
    if (expectedVersion !== undefined) {
      assertExpectedVersion(existing, expectedVersion);
    }
    const published = loaded.published;
    if (!published) {
      return withUnpublishedFlag(
        existing,
        undefined,
        this.publishConfig.contentEqual,
      );
    }
    if (this.publishConfig.contentEqual(existing, published)) {
      return withUnpublishedFlag(
        existing,
        published,
        this.publishConfig.contentEqual,
      );
    }
    const next = nextDiscardState(existing, published);
    await this.persistMutation(existing, next, {});
    return withUnpublishedFlag(
      next,
      published,
      this.publishConfig.contentEqual,
    );
  }
}

export type PublishableSingletonConfig<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> = PublishableConfig<T, TItem> & {
  singletonId: string;
  defaultEntity: T;
  mergeUpdate: (existing: T, input: TUpdate) => T;
};

/** Thin singleton façade — does not re-implement publish/unpublish/discard. */
export class PublishableSingletonRepository<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> {
  protected readonly store: PublishableRepository<T, TItem>;
  private readonly singletonId: string;
  private readonly defaultEntity: T;
  private readonly mergeUpdateFn: (existing: T, input: TUpdate) => T;
  private readonly contentEqual: (a: T, b: T) => boolean;
  private readonly toItem: (entity: T) => TItem;
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(
    config: PublishableSingletonConfig<T, TItem, TUpdate>,
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
  ) {
    this.store = new PublishableRepository(config, doc, tableName);
    this.singletonId = config.singletonId;
    this.defaultEntity = config.defaultEntity;
    this.mergeUpdateFn = config.mergeUpdate;
    this.contentEqual = config.contentEqual;
    this.toItem = config.toItem;
    this.doc = doc;
    this.tableName = tableName;
  }

  async getPublished(): Promise<T | undefined> {
    return this.store.getPublished(this.singletonId);
  }

  async get(): Promise<T | undefined> {
    return this.store.getById(this.singletonId);
  }

  async getOrCreate(): Promise<T> {
    const existing = await this.get();
    if (existing) return existing;

    const seeded: T = {
      ...this.defaultEntity,
      status: 'draft',
      publishedAt: null,
      updatedAt: nowIso(),
      version: 1,
      hasUnpublishedChanges: false,
    };
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.toItem(seeded),
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (error) {
      if (isOptimisticLockConflict(error)) {
        const raced = await this.get();
        if (raced) return raced;
      }
      throw error;
    }
    return seeded;
  }

  async update(input: TUpdate): Promise<T> {
    const loaded = await this.store.loadDraftAndPublished(this.singletonId);
    const existing = loaded
      ? withUnpublishedFlag(loaded.draft, loaded.published, this.contentEqual)
      : await this.getOrCreate();
    assertExpectedVersion(existing, input.version);
    const next: T = {
      ...this.mergeUpdateFn(existing, input),
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.store.persistMutation(existing, next, {});
    return withUnpublishedFlag(next, loaded?.published, this.contentEqual);
  }

  async publish(expectedVersion?: number): Promise<T> {
    await this.getOrCreate();
    return this.store.publish(this.singletonId, { version: expectedVersion });
  }

  async unpublish(expectedVersion?: number): Promise<T> {
    await this.getOrCreate();
    return this.store.unpublish(this.singletonId, expectedVersion);
  }

  async discard(expectedVersion?: number): Promise<T> {
    await this.getOrCreate();
    return this.store.discard(this.singletonId, expectedVersion);
  }
}

/** @deprecated Use PublishableSingletonConfig */
export type PublishableRepositoryConfig<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> = PublishableSingletonConfig<T, TItem, TUpdate>;
