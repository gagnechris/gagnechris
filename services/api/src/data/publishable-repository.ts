/**
 * Publishable layer: draft META + optional PUBLISHED snapshot (CHR-129).
 * Shared by Home/Resume (singleton) and Posts (keyed).
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
} from '@gagnechris/shared';
import { getDocClient, requireTableName } from './client.js';
import { runDynamoWrite } from './dynamo-write.js';
import { ConflictError, NotFoundError } from './errors.js';

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
  expectedVersion: number | undefined,
): void {
  if (expectedVersion === undefined) return;
  if (existing.version !== expectedVersion) {
    throw new ConflictError(
      `Version conflict: expected ${expectedVersion}, current ${existing.version}`,
      { currentVersion: existing.version, current: existing },
    );
  }
}

/** Shared publish / unpublish / discard next-state builders. */
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

export type PublishableKeyedConfig<
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
  /** Soft-deleted entities are treated as missing. */
  isDeleted?: (entity: T) => boolean;
};

export type PersistPublishOptions<T extends PublishableEntity> = {
  syncPublished?: boolean;
  deletePublished?: boolean;
  previousPublished?: T;
};

/**
 * Id-keyed publishable entities (posts). Subclasses own create/update/list and
 * optional side-effect transactions (slug/tag) via `persistMutation`.
 */
export abstract class PublishableKeyedRepository<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
> {
  constructor(
    protected readonly config: PublishableKeyedConfig<T, TItem>,
    protected readonly doc: DynamoDBDocumentClient = getDocClient(),
    protected readonly tableName: string = requireTableName(),
  ) {}

  protected abstract persistMutation(
    before: T,
    after: T,
    options: PersistPublishOptions<T>,
  ): Promise<void>;

  async getPublished(id: string): Promise<T | undefined> {
    const keys = this.config.keysFor(id);
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: keys.pk, sk: keys.publishedSk },
      }),
    );
    if (!result.Item) return undefined;
    return this.config.toEntity(result.Item as TItem, false);
  }

  protected async loadDraftAndPublished(
    id: string,
  ): Promise<{ draft: T; published: T | undefined } | undefined> {
    const keys = this.config.keysFor(id);
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

    const draft = this.config.toEntity(draftItem);
    if (this.config.isDeleted?.(draft)) return undefined;

    let published = publishedItem
      ? this.config.toEntity(publishedItem, false)
      : undefined;

    if (draft.status === 'published' && !published) {
      await this.putPublishedIfAbsent(draft);
      published = { ...draft, hasUnpublishedChanges: false };
    }

    return { draft, published };
  }

  async getById(id: string): Promise<T | undefined> {
    const loaded = await this.loadDraftAndPublished(id);
    if (!loaded) return undefined;
    return withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      this.config.contentEqual,
    );
  }

  async getByIdOrThrow(id: string): Promise<T> {
    const entity = await this.getById(id);
    if (!entity) {
      throw new NotFoundError(`${this.config.conflictLabel} ${id} not found`);
    }
    return entity;
  }

  async publish(
    id: string,
    options?: { publishedAt?: string; version?: number },
  ): Promise<T> {
    const existing = await this.getByIdOrThrow(id);
    assertExpectedVersion(existing, options?.version);
    const published = await this.getPublished(id);
    if (
      existing.status === 'published' &&
      published &&
      this.config.contentEqual(existing, published)
    ) {
      return withUnpublishedFlag(existing, published, this.config.contentEqual);
    }
    const next = nextPublishedState(existing, {
      publishedAt: options?.publishedAt,
    });
    await this.persistMutation(existing, next, {
      syncPublished: true,
      previousPublished: published,
    });
    return withUnpublishedFlag(next, next, this.config.contentEqual);
  }

  async unpublish(id: string, expectedVersion?: number): Promise<T> {
    const existing = await this.getByIdOrThrow(id);
    assertExpectedVersion(existing, expectedVersion);
    if (existing.status !== 'published') {
      return withUnpublishedFlag(existing, undefined, this.config.contentEqual);
    }
    const published = await this.getPublished(id);
    const next = nextUnpublishedState(existing);
    await this.persistMutation(existing, next, {
      deletePublished: true,
      previousPublished: published,
    });
    return next;
  }

  async discard(id: string, expectedVersion?: number): Promise<T> {
    const existing = await this.getByIdOrThrow(id);
    assertExpectedVersion(existing, expectedVersion);
    const published = await this.getPublished(id);
    if (!published) {
      return withUnpublishedFlag(existing, undefined, this.config.contentEqual);
    }
    if (this.config.contentEqual(existing, published)) {
      return withUnpublishedFlag(existing, published, this.config.contentEqual);
    }
    const next = nextDiscardState(existing, published);
    await this.persistMutation(existing, next, {});
    return withUnpublishedFlag(next, published, this.config.contentEqual);
  }

  protected async putPublishedIfAbsent(draft: T): Promise<void> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.config.toPublishedItem(draft),
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (error) {
      if (isOptimisticLockConflict(error)) return;
      throw error;
    }
  }
}

export type PublishableSingletonConfig<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> = {
  conflictLabel: string;
  defaultEntity: T;
  pk: () => string;
  metaSk: () => string;
  publishedSk: () => string;
  toEntity: (item: TItem, hasUnpublishedChanges?: boolean) => T;
  toItem: (entity: T) => TItem;
  toPublishedItem: (entity: T) => TItem;
  contentEqual: (a: T, b: T) => boolean;
  mergeUpdate: (existing: T, input: TUpdate) => T;
};

/** @deprecated Use PublishableSingletonConfig */
export type PublishableRepositoryConfig<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> = PublishableSingletonConfig<T, TItem, TUpdate>;

/**
 * DynamoDB publishable singleton (Home / Resume): draft META + PUBLISHED.
 */
export class PublishableSingletonRepository<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> {
  constructor(
    private readonly config: PublishableSingletonConfig<T, TItem, TUpdate>,
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
  ) {}

  async getPublished(): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: this.config.pk(), sk: this.config.publishedSk() },
      }),
    );
    if (!result.Item) return undefined;
    return this.config.toEntity(result.Item as TItem, false);
  }

  private async loadDraftAndPublished(): Promise<
    { draft: T; published: T | undefined } | undefined
  > {
    const responses = await batchGetAllWithDocClient(
      async (RequestItems) =>
        this.doc.send(new BatchGetCommand({ RequestItems })),
      {
        [this.tableName]: {
          Keys: [
            { pk: this.config.pk(), sk: this.config.metaSk() },
            { pk: this.config.pk(), sk: this.config.publishedSk() },
          ],
        },
      },
    );
    const items = responses[this.tableName] ?? [];
    let draftItem: TItem | undefined;
    let publishedItem: TItem | undefined;
    for (const item of items) {
      const sk = (item as { sk?: string }).sk;
      if (sk === this.config.metaSk()) draftItem = item as TItem;
      if (sk === this.config.publishedSk()) publishedItem = item as TItem;
    }
    if (!draftItem) return undefined;

    const draft = this.config.toEntity(draftItem);
    let published = publishedItem
      ? this.config.toEntity(publishedItem, false)
      : undefined;

    if (draft.status === 'published' && !published) {
      await this.putPublishedIfAbsent(draft);
      published = { ...draft, hasUnpublishedChanges: false };
    }

    return { draft, published };
  }

  async get(): Promise<T | undefined> {
    const loaded = await this.loadDraftAndPublished();
    if (!loaded) return undefined;
    return withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      this.config.contentEqual,
    );
  }

  async getOrCreate(): Promise<T> {
    const loaded = await this.loadDraftAndPublished();
    if (loaded) {
      return withUnpublishedFlag(
        loaded.draft,
        loaded.published,
        this.config.contentEqual,
      );
    }

    const seeded: T = {
      ...this.config.defaultEntity,
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
          Item: this.config.toItem(seeded),
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
    const loaded = await this.loadDraftAndPublished();
    const existing = loaded
      ? withUnpublishedFlag(
          loaded.draft,
          loaded.published,
          this.config.contentEqual,
        )
      : await this.getOrCreate();
    assertExpectedVersion(existing, input.version);
    const next: T = {
      ...this.config.mergeUpdate(existing, input),
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraft(existing.version, next);
    return withUnpublishedFlag(
      next,
      loaded?.published,
      this.config.contentEqual,
    );
  }

  async publish(expectedVersion?: number): Promise<T> {
    const loaded = await this.loadDraftAndPublished();
    const existing = loaded
      ? withUnpublishedFlag(
          loaded.draft,
          loaded.published,
          this.config.contentEqual,
        )
      : await this.getOrCreate();
    assertExpectedVersion(existing, expectedVersion);
    const published = loaded?.published;
    if (
      existing.status === 'published' &&
      published &&
      this.config.contentEqual(existing, published)
    ) {
      return withUnpublishedFlag(existing, published, this.config.contentEqual);
    }
    const next = nextPublishedState(existing);
    await this.writeDraftAndPublished(existing.version, next);
    return withUnpublishedFlag(next, next, this.config.contentEqual);
  }

  async unpublish(expectedVersion?: number): Promise<T> {
    const loaded = await this.loadDraftAndPublished();
    const existing = loaded
      ? withUnpublishedFlag(
          loaded.draft,
          loaded.published,
          this.config.contentEqual,
        )
      : await this.getOrCreate();
    assertExpectedVersion(existing, expectedVersion);
    if (existing.status !== 'published') {
      return withUnpublishedFlag(existing, undefined, this.config.contentEqual);
    }
    const next = nextUnpublishedState(existing);
    await this.writeDraftAndDeletePublished(existing.version, next);
    return next;
  }

  async discard(expectedVersion?: number): Promise<T> {
    const loaded = await this.loadDraftAndPublished();
    const existing = loaded
      ? withUnpublishedFlag(
          loaded.draft,
          loaded.published,
          this.config.contentEqual,
        )
      : await this.getOrCreate();
    assertExpectedVersion(existing, expectedVersion);
    const published = loaded?.published;
    if (!published) {
      return withUnpublishedFlag(existing, undefined, this.config.contentEqual);
    }
    if (this.config.contentEqual(existing, published)) {
      return withUnpublishedFlag(existing, published, this.config.contentEqual);
    }
    const next = nextDiscardState(existing, published);
    await this.writeDraft(existing.version, next);
    return withUnpublishedFlag(next, published, this.config.contentEqual);
  }

  private async putPublishedIfAbsent(draft: T): Promise<void> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.config.toPublishedItem(draft),
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (error) {
      if (isOptimisticLockConflict(error)) return;
      throw error;
    }
  }

  private async writeDraft(expectedVersion: number, next: T): Promise<void> {
    await runDynamoWrite(
      () =>
        this.doc.send(
          new PutCommand({
            TableName: this.tableName,
            Item: this.config.toItem(next),
            ConditionExpression:
              'attribute_not_exists(version) OR version = :v',
            ExpressionAttributeValues: { ':v': expectedVersion },
          }),
        ),
      `Update conflict (${this.config.conflictLabel} version)`,
    );
  }

  private async writeDraftAndPublished(
    expectedVersion: number,
    next: T,
  ): Promise<void> {
    await runDynamoWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.tableName,
                  Item: this.config.toItem(next),
                  ConditionExpression:
                    'attribute_not_exists(version) OR version = :v',
                  ExpressionAttributeValues: { ':v': expectedVersion },
                },
              },
              {
                Put: {
                  TableName: this.tableName,
                  Item: this.config.toPublishedItem(next),
                },
              },
            ],
          }),
        ),
      `Publish conflict (${this.config.conflictLabel} version)`,
    );
  }

  private async writeDraftAndDeletePublished(
    expectedVersion: number,
    next: T,
  ): Promise<void> {
    await runDynamoWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.tableName,
                  Item: this.config.toItem(next),
                  ConditionExpression:
                    'attribute_not_exists(version) OR version = :v',
                  ExpressionAttributeValues: { ':v': expectedVersion },
                },
              },
              {
                Delete: {
                  TableName: this.tableName,
                  Key: {
                    pk: this.config.pk(),
                    sk: this.config.publishedSk(),
                  },
                },
              },
            ],
          }),
        ),
      `Unpublish conflict (${this.config.conflictLabel} version)`,
    );
  }
}
