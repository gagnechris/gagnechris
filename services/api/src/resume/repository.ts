import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  DEFAULT_RESUME,
  type Resume,
  type UpdateResumeRequest,
} from '@gagnechris/shared';
import { getDocClient, requireTableName } from '../data/client.js';
import { ConflictError } from '../data/errors.js';
import {
  buildResumeMetaItem,
  buildResumePublishedItem,
  metaToResume,
  nowIso,
  resumeContentEqual,
  resumeMetaSk,
  resumePk,
  resumePublishedSk,
  type ResumeMetaItem,
} from './keys.js';

export class ResumeRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
  ) {}

  async getPublished(): Promise<Resume | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: resumePk(), sk: resumePublishedSk() },
      }),
    );
    if (!result.Item) return undefined;
    return metaToResume(result.Item as ResumeMetaItem, false);
  }

  async get(): Promise<Resume | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: resumePk(), sk: resumeMetaSk() },
      }),
    );
    if (!result.Item) return undefined;
    const draft = metaToResume(result.Item as ResumeMetaItem);
    await this.migratePublishedSnapshot(draft);
    const published = await this.getPublished();
    return this.withUnpublishedFlag(draft, published);
  }

  /**
   * Seeds the singleton as a **draft** on first read. Live HTML/PDF are
   * unchanged until an explicit Publish writes the PUBLISHED snapshot.
   */
  async getOrCreate(): Promise<Resume> {
    const existing = await this.get();
    if (existing) return existing;

    const now = nowIso();
    const seeded: Resume = {
      ...DEFAULT_RESUME,
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
          Item: buildResumeMetaItem(seeded),
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

  async update(input: UpdateResumeRequest): Promise<Resume> {
    const existing = await this.getOrCreate();
    if (existing.version !== input.version) {
      throw new ConflictError(
        `Version conflict: expected ${input.version}, current ${existing.version}`,
      );
    }
    const next: Resume = {
      ...existing,
      name: input.name ?? existing.name,
      pdfPath: input.pdfPath ?? existing.pdfPath,
      content: input.content ?? existing.content,
      seo: input.seo !== undefined ? input.seo : existing.seo,
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraft(existing.version, next);
    const published = await this.getPublished();
    return this.withUnpublishedFlag(next, published);
  }

  async publish(): Promise<Resume> {
    const existing = await this.getOrCreate();
    const published = await this.getPublished();
    if (
      existing.status === 'published' &&
      published &&
      resumeContentEqual(existing, published)
    ) {
      return this.withUnpublishedFlag(existing, published);
    }
    const updatedAt = nowIso();
    const next: Resume = {
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

  async unpublish(): Promise<Resume> {
    const existing = await this.getOrCreate();
    if (existing.status !== 'published') {
      return this.withUnpublishedFlag(existing, undefined);
    }
    const next: Resume = {
      ...existing,
      status: 'draft',
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraftAndDeletePublished(existing.version, next);
    return next;
  }

  async discard(): Promise<Resume> {
    const existing = await this.getOrCreate();
    const published = await this.getPublished();
    if (!published) {
      return this.withUnpublishedFlag(existing, undefined);
    }
    if (resumeContentEqual(existing, published)) {
      return this.withUnpublishedFlag(existing, published);
    }
    const next: Resume = {
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

  private async migratePublishedSnapshot(draft: Resume): Promise<void> {
    if (draft.status !== 'published') return;
    const published = await this.getPublished();
    if (published) return;
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: buildResumePublishedItem(draft),
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return;
      throw error;
    }
  }

  private withUnpublishedFlag(
    draft: Resume,
    published: Resume | undefined,
  ): Resume {
    return {
      ...draft,
      hasUnpublishedChanges:
        draft.status === 'published' &&
        published !== undefined &&
        !resumeContentEqual(draft, published),
    };
  }

  private async writeDraft(
    expectedVersion: number,
    next: Resume,
  ): Promise<void> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: buildResumeMetaItem(next),
          ConditionExpression:
            'attribute_not_exists(version) OR version = :v',
          ExpressionAttributeValues: { ':v': expectedVersion },
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError('Update conflict (resume version)');
      }
      throw error;
    }
  }

  private async writeDraftAndPublished(
    expectedVersion: number,
    next: Resume,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: buildResumeMetaItem(next),
                ConditionExpression:
                  'attribute_not_exists(version) OR version = :v',
                ExpressionAttributeValues: { ':v': expectedVersion },
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: buildResumePublishedItem(next),
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError('Update conflict (resume version)');
      }
      throw error;
    }
  }

  private async writeDraftAndDeletePublished(
    expectedVersion: number,
    next: Resume,
  ): Promise<void> {
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: buildResumeMetaItem(next),
                ConditionExpression:
                  'attribute_not_exists(version) OR version = :v',
                ExpressionAttributeValues: { ':v': expectedVersion },
              },
            },
            {
              Delete: {
                TableName: this.tableName,
                Key: { pk: resumePk(), sk: resumePublishedSk() },
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new ConflictError('Update conflict (resume version)');
      }
      throw error;
    }
  }
}
