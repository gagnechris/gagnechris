/**
 * Publishable layer: draft META + optional PUBLISHED snapshot (CHR-129).
 * Built on VersionedEntityRepository patterns; used by Home/Resume (and Posts).
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
import { ConflictError } from './errors.js';

export type PublishableEntity = {
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  version: number;
  hasUnpublishedChanges?: boolean;
};

export type PublishableRepositoryConfig<
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

export const nowIso = (): string => new Date().toISOString();

/**
 * DynamoDB publishable singleton (Home / Resume): draft META + PUBLISHED.
 */
export class PublishableSingletonRepository<
  T extends PublishableEntity,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> {
  constructor(
    private readonly config: PublishableRepositoryConfig<T, TItem, TUpdate>,
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
    return this.withUnpublishedFlag(loaded.draft, loaded.published);
  }

  async getOrCreate(): Promise<T> {
    const loaded = await this.loadDraftAndPublished();
    if (loaded) {
      return this.withUnpublishedFlag(loaded.draft, loaded.published);
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
      ? this.withUnpublishedFlag(loaded.draft, loaded.published)
      : await this.getOrCreate();
    if (existing.version !== input.version) {
      throw new ConflictError(
        `Version conflict: expected ${input.version}, current ${existing.version}`,
        { currentVersion: existing.version, current: existing },
      );
    }
    const next: T = {
      ...this.config.mergeUpdate(existing, input),
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraft(existing.version, next);
    return this.withUnpublishedFlag(next, loaded?.published);
  }

  async publish(expectedVersion?: number): Promise<T> {
    const loaded = await this.loadDraftAndPublished();
    const existing = loaded
      ? this.withUnpublishedFlag(loaded.draft, loaded.published)
      : await this.getOrCreate();
    this.assertVersion(existing, expectedVersion);
    const published = loaded?.published;
    if (
      existing.status === 'published' &&
      published &&
      this.config.contentEqual(existing, published)
    ) {
      return this.withUnpublishedFlag(existing, published);
    }
    const updatedAt = nowIso();
    const next: T = {
      ...existing,
      status: 'published',
      publishedAt: existing.publishedAt ?? updatedAt,
      updatedAt,
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraftAndPublished(existing.version, next);
    return this.withUnpublishedFlag(next, next);
  }

  async unpublish(expectedVersion?: number): Promise<T> {
    const loaded = await this.loadDraftAndPublished();
    const existing = loaded
      ? this.withUnpublishedFlag(loaded.draft, loaded.published)
      : await this.getOrCreate();
    this.assertVersion(existing, expectedVersion);
    if (existing.status !== 'published') {
      return this.withUnpublishedFlag(existing, undefined);
    }
    const next: T = {
      ...existing,
      status: 'draft',
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraftAndDeletePublished(existing.version, next);
    return next;
  }

  async discard(expectedVersion?: number): Promise<T> {
    const loaded = await this.loadDraftAndPublished();
    const existing = loaded
      ? this.withUnpublishedFlag(loaded.draft, loaded.published)
      : await this.getOrCreate();
    this.assertVersion(existing, expectedVersion);
    const published = loaded?.published;
    if (!published) {
      return this.withUnpublishedFlag(existing, undefined);
    }
    if (this.config.contentEqual(existing, published)) {
      return this.withUnpublishedFlag(existing, published);
    }
    const next: T = {
      ...published,
      status: 'published',
      publishedAt: existing.publishedAt ?? published.publishedAt,
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraft(existing.version, next);
    return this.withUnpublishedFlag(next, published);
  }

  private assertVersion(existing: T, expectedVersion?: number): void {
    if (expectedVersion === undefined) return;
    if (existing.version !== expectedVersion) {
      throw new ConflictError(
        `Version conflict: expected ${expectedVersion}, current ${existing.version}`,
        { currentVersion: existing.version, current: existing },
      );
    }
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

  private withUnpublishedFlag(draft: T, published: T | undefined): T {
    return {
      ...draft,
      hasUnpublishedChanges:
        draft.status === 'published' &&
        published !== undefined &&
        !this.config.contentEqual(draft, published),
    };
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
