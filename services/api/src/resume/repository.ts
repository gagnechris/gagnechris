import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  PutCommand,
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
  metaToResume,
  nowIso,
  resumeMetaSk,
  resumePk,
  type ResumeMetaItem,
} from './keys.js';

export class ResumeRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
  ) {}

  async get(): Promise<Resume | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: resumePk(), sk: resumeMetaSk() },
      }),
    );
    if (!result.Item) return undefined;
    return metaToResume(result.Item as ResumeMetaItem);
  }

  /**
   * Seeds the singleton as **published** on first read so the publisher emits
   * live HTML matching today's content without a manual cutover publish.
   */
  async getOrCreate(): Promise<Resume> {
    const existing = await this.get();
    if (existing) return existing;

    const now = nowIso();
    const seeded: Resume = {
      ...DEFAULT_RESUME,
      status: 'published',
      publishedAt: now,
      updatedAt: now,
      version: 1,
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
    };
    await this.write(existing.version, next);
    return next;
  }

  async publish(): Promise<Resume> {
    const existing = await this.getOrCreate();
    if (existing.status === 'published') return existing;
    const updatedAt = nowIso();
    const next: Resume = {
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
  async unpublish(): Promise<Resume> {
    const existing = await this.getOrCreate();
    if (existing.status !== 'published') return existing;
    const next: Resume = {
      ...existing,
      status: 'draft',
      updatedAt: nowIso(),
      version: existing.version + 1,
    };
    await this.write(existing.version, next);
    return next;
  }

  private async write(expectedVersion: number, next: Resume): Promise<void> {
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
}
