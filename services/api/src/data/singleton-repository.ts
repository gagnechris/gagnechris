import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { getDocClient, requireTableName } from './client.js';
import { ConflictError } from './errors.js';

export type VersionedSingleton = {
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  version: number;
  hasUnpublishedChanges?: boolean;
};

export type SingletonRepositoryConfig<
  T extends VersionedSingleton,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> = {
  conflictLabel: string;
  /** Seeded on first read as draft (live site unchanged until Publish). */
  defaultEntity: T;
  pk: () => string;
  metaSk: () => string;
  publishedSk: () => string;
  /** Map Dynamo item → entity; `hasUnpublishedChanges` is applied by the base. */
  toEntity: (item: TItem, hasUnpublishedChanges?: boolean) => T;
  toItem: (entity: T) => TItem;
  toPublishedItem: (entity: T) => TItem;
  /** Content-only equality for draft vs PUBLISHED drift. */
  contentEqual: (a: T, b: T) => boolean;
  /** Merge update fields onto existing; base class bumps version / updatedAt. */
  mergeUpdate: (existing: T, input: TUpdate) => T;
};

export const nowIso = (): string => new Date().toISOString();

/**
 * DynamoDB singleton (Home / Resume): draft META + optional PUBLISHED snapshot.
 */
export class SingletonRepository<
  T extends VersionedSingleton,
  TItem extends Record<string, unknown>,
  TUpdate extends { version: number },
> {
  constructor(
    private readonly config: SingletonRepositoryConfig<T, TItem, TUpdate>,
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

  async get(): Promise<T | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: this.config.pk(), sk: this.config.metaSk() },
      }),
    );
    if (!result.Item) return undefined;
    const draft = this.config.toEntity(result.Item as TItem);
    await this.migratePublishedSnapshot(draft);
    const published = await this.getPublished();
    return this.withUnpublishedFlag(draft, published);
  }

  /**
   * Seeds the singleton as a **draft** on first read. Live HTML is unchanged
   * until an explicit Publish writes the PUBLISHED snapshot.
   */
  async getOrCreate(): Promise<T> {
    const existing = await this.get();
    if (existing) return existing;

    const now = nowIso();
    const seeded: T = {
      ...this.config.defaultEntity,
      status: 'draft',
      publishedAt: null,
      updatedAt: now,
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
      if (error instanceof ConditionalCheckFailedException) {
        const raced = await this.get();
        if (raced) return raced;
      }
      throw error;
    }
    return seeded;
  }

  async update(input: TUpdate): Promise<T> {
    const existing = await this.getOrCreate();
    if (existing.version !== input.version) {
      throw new ConflictError(
        `Version conflict: expected ${input.version}, current ${existing.version}`,
      );
    }
    const next: T = {
      ...this.config.mergeUpdate(existing, input),
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraft(existing.version, next);
    const published = await this.getPublished();
    return this.withUnpublishedFlag(next, published);
  }

  /**
   * Copies the draft META onto PUBLISHED. Re-publish after edits is intentional
   * (no longer a no-op when already published).
   */
  async publish(): Promise<T> {
    const existing = await this.getOrCreate();
    const published = await this.getPublished();
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

  /** Keeps `publishedAt` so republishing does not reset the first-published date. */
  async unpublish(): Promise<T> {
    const existing = await this.getOrCreate();
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

  /** Restore draft META from the PUBLISHED snapshot (admin Discard). */
  async discard(): Promise<T> {
    const existing = await this.getOrCreate();
    const published = await this.getPublished();
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

  /**
   * One-time cutover: if META is already published and PUBLISHED is missing,
   * copy META → PUBLISHED so the live site stays unchanged.
   */
  private async migratePublishedSnapshot(draft: T): Promise<void> {
    if (draft.status !== 'published') return;
    const published = await this.getPublished();
    if (published) return;
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.config.toPublishedItem(draft),
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return;
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
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: this.config.toItem(next),
          ConditionExpression:
            'attribute_not_exists(version) OR version = :v',
          ExpressionAttributeValues: { ':v': expectedVersion },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError(
          `Update conflict (${this.config.conflictLabel} version)`,
        );
      }
      throw error;
    }
  }

  private async writeDraftAndPublished(
    expectedVersion: number,
    next: T,
  ): Promise<void> {
    try {
      await this.doc.send(
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
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError(
          `Update conflict (${this.config.conflictLabel} version)`,
        );
      }
      throw error;
    }
  }

  private async writeDraftAndDeletePublished(
    expectedVersion: number,
    next: T,
  ): Promise<void> {
    try {
      await this.doc.send(
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
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError(
          `Update conflict (${this.config.conflictLabel} version)`,
        );
      }
      throw error;
    }
  }
}
