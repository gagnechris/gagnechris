import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_HOME,
  type Home,
  type UpdateHomeRequest,
} from '@gagnechris/shared';
import { getDocClient, requireTableName } from '../data/client.js';
import { ConflictError } from '../data/errors.js';
import {
  buildHomeMetaItem,
  buildHomePublishedItem,
  homeContentEqual,
  homeMetaSk,
  homePk,
  homePublishedSk,
  metaToHome,
  nowIso,
  type HomeMetaItem,
} from './keys.js';

export class HomeRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
  ) {}

  async getPublished(): Promise<Home | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: homePk(), sk: homePublishedSk() },
      }),
    );
    if (!result.Item) return undefined;
    return metaToHome(result.Item as HomeMetaItem, false);
  }

  async get(): Promise<Home | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: homePk(), sk: homeMetaSk() },
      }),
    );
    if (!result.Item) return undefined;
    const draft = metaToHome(result.Item as HomeMetaItem);
    await this.migratePublishedSnapshot(draft);
    const published = await this.getPublished();
    return this.withUnpublishedFlag(draft, published);
  }

  /**
   * Seeds the singleton as a **draft** on first read. Live HTML is unchanged
   * until an explicit Publish writes the PUBLISHED snapshot.
   */
  async getOrCreate(): Promise<Home> {
    const existing = await this.get();
    if (existing) return existing;

    const now = nowIso();
    const seeded: Home = {
      ...DEFAULT_HOME,
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
          Item: buildHomeMetaItem(seeded),
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

  async update(input: UpdateHomeRequest): Promise<Home> {
    const existing = await this.getOrCreate();
    if (existing.version !== input.version) {
      throw new ConflictError(
        `Version conflict: expected ${input.version}, current ${existing.version}`,
      );
    }
    const next: Home = {
      ...existing,
      name: input.name ?? existing.name,
      title: input.title ?? existing.title,
      about: input.about ?? existing.about,
      seo: input.seo !== undefined ? input.seo : existing.seo,
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
  async publish(): Promise<Home> {
    const existing = await this.getOrCreate();
    const published = await this.getPublished();
    if (
      existing.status === 'published' &&
      published &&
      homeContentEqual(existing, published)
    ) {
      return this.withUnpublishedFlag(existing, published);
    }
    const updatedAt = nowIso();
    const next: Home = {
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
  async unpublish(): Promise<Home> {
    const existing = await this.getOrCreate();
    if (existing.status !== 'published') {
      return this.withUnpublishedFlag(existing, undefined);
    }
    const next: Home = {
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
  async discard(): Promise<Home> {
    const existing = await this.getOrCreate();
    const published = await this.getPublished();
    if (!published) {
      return this.withUnpublishedFlag(existing, undefined);
    }
    if (homeContentEqual(existing, published)) {
      return this.withUnpublishedFlag(existing, published);
    }
    const next: Home = {
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
  private async migratePublishedSnapshot(draft: Home): Promise<void> {
    if (draft.status !== 'published') return;
    const published = await this.getPublished();
    if (published) return;
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: buildHomePublishedItem(draft),
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return;
      throw error;
    }
  }

  private withUnpublishedFlag(
    draft: Home,
    published: Home | undefined,
  ): Home {
    return {
      ...draft,
      hasUnpublishedChanges:
        draft.status === 'published' &&
        published !== undefined &&
        !homeContentEqual(draft, published),
    };
  }

  private async writeDraft(expectedVersion: number, next: Home): Promise<void> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: buildHomeMetaItem(next),
          ConditionExpression:
            'attribute_not_exists(version) OR version = :v',
          ExpressionAttributeValues: { ':v': expectedVersion },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError('Update conflict (home version)');
      }
      throw error;
    }
  }

  private async writeDraftAndPublished(
    expectedVersion: number,
    next: Home,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: buildHomeMetaItem(next),
                ConditionExpression:
                  'attribute_not_exists(version) OR version = :v',
                ExpressionAttributeValues: { ':v': expectedVersion },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: buildHomePublishedItem(next),
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError('Update conflict (home version)');
      }
      throw error;
    }
  }

  private async writeDraftAndDeletePublished(
    expectedVersion: number,
    next: Home,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: buildHomeMetaItem(next),
                ConditionExpression:
                  'attribute_not_exists(version) OR version = :v',
                ExpressionAttributeValues: { ':v': expectedVersion },
              },
            },
            {
              Delete: {
                TableName: this.tableName,
                Key: { pk: homePk(), sk: homePublishedSk() },
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError('Update conflict (home version)');
      }
      throw error;
    }
  }
}
