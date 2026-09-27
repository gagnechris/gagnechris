import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
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
  homeMetaSk,
  homePk,
  metaToHome,
  nowIso,
  type HomeMetaItem,
} from './keys.js';

export class HomeRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
  ) {}

  async get(): Promise<Home | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: homePk(), sk: homeMetaSk() },
      }),
    );
    if (!result.Item) return undefined;
    return metaToHome(result.Item as HomeMetaItem);
  }

  /**
   * Seeds the singleton as **published** on first read so the publisher emits
   * live HTML matching today's content without a manual cutover publish.
   */
  async getOrCreate(): Promise<Home> {
    const existing = await this.get();
    if (existing) return existing;

    const now = nowIso();
    const seeded: Home = {
      ...DEFAULT_HOME,
      status: 'published',
      publishedAt: now,
      updatedAt: now,
      version: 1,
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
    };
    await this.write(existing.version, next);
    return next;
  }

  async publish(): Promise<Home> {
    const existing = await this.getOrCreate();
    if (existing.status === 'published') return existing;
    const updatedAt = nowIso();
    const next: Home = {
      ...existing,
      status: 'published',
      publishedAt: existing.publishedAt ?? updatedAt,
      updatedAt,
      version: existing.version + 1,
    };
    await this.write(existing.version, next);
    return next;
  }

  /** Keeps `publishedAt` so republishing does not reset the first-published date. */
  async unpublish(): Promise<Home> {
    const existing = await this.getOrCreate();
    if (existing.status !== 'published') return existing;
    const next: Home = {
      ...existing,
      status: 'draft',
      updatedAt: nowIso(),
      version: existing.version + 1,
    };
    await this.write(existing.version, next);
    return next;
  }

  private async write(expectedVersion: number, next: Home): Promise<void> {
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
}
