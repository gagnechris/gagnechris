import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  POSTS_PAGE_SIZE,
  type CreatePostRequest,
  type Post,
  type PostStatus,
  type PostSummary,
  type UpdatePostRequest,
} from '@gagnechris/shared';
import {
  GSI1_NAME,
  POST_SUMMARY_ATTRIBUTES,
  buildMetaItem,
  buildPublishedItem,
  metaToPost,
  normalizeTags,
  parsePostMetaItem,
  parsePostSummaryItem,
  postContentEqual,
  postMetaSk,
  postPk,
  postPublishedSk,
  slugify,
  statusGsi1Pk,
  type PostMetaItem,
} from '@gagnechris/data';
import { ulid } from 'ulid';
import { getDocClient, requireTableName } from '../data/client.js';
import { systemClock, type Clock } from '../data/clock.js';
import { GSI1_CURSOR_KEYS } from '../data/cursor.js';
import { walkPartitions } from '../data/partition-walk.js';
import { PublishableRepository } from '../data/publishable-repository.js';
import { POST_SLUG_CLAIMS } from '../data/slug-claims.js';
import { buildTagSyncItems } from './tag-index.js';

// Published first so admin "all" pages surface live posts before drafts.
const ALL_LISTED_STATUSES: readonly PostStatus[] = ['published', 'draft'];

export class PostsRepository extends PublishableRepository<Post, PostMetaItem> {
  constructor(
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
    now: Clock = systemClock,
  ) {
    super(
      {
        conflictLabel: 'Post',
        keysFor: (id) => ({
          pk: postPk(id),
          metaSk: postMetaSk(),
          publishedSk: postPublishedSk(),
        }),
        idOf: (p) => p.id,
        toEntity: (item, hasUnpublishedChanges) =>
          metaToPost(parsePostMetaItem(item), hasUnpublishedChanges),
        toItem: buildMetaItem,
        toPublishedItem: buildPublishedItem,
        contentEqual: postContentEqual,
        isDeleted: (p) => p.status === 'deleted',
        cursorKeyNames: GSI1_CURSOR_KEYS,
        slugClaims: POST_SLUG_CLAIMS,
        extraMutationItems: (_before, after, options) =>
          buildTagSyncItems(tableName, after, options),
      },
      doc,
      tableName,
      now,
    );
  }

  async getBySlug(slug: string): Promise<Post | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: POST_SLUG_CLAIMS.claimKey(slugify(slug)),
      }),
    );
    const postId = result.Item?.postId;
    if (typeof postId !== 'string' || !postId) return undefined;
    return this.getById(postId);
  }

  /** Results are grouped by status (see {@link walkPartitions}), newest first within each. */
  async list(
    status: PostStatus | undefined,
    opts: { cursor?: string; limit?: number } = {},
  ): Promise<{ items: PostSummary[]; nextCursor?: string }> {
    return walkPartitions(
      status ? [status] : ALL_LISTED_STATUSES,
      opts.cursor,
      opts.limit ?? POSTS_PAGE_SIZE,
      (partition, cursor, remaining, remainingBytes) => {
        const pk = statusGsi1Pk(partition);
        return this.queryListPage(
          {
            IndexName: GSI1_NAME,
            KeyConditionExpression: 'gsi1pk = :pk',
            ExpressionAttributeValues: { ':pk': pk },
            ScanIndexForward: false,
            cursor,
            limit: remaining,
            cursorPartition: { attr: 'gsi1pk', value: pk },
            byteBudget: remainingBytes,
          },
          {
            attributes: POST_SUMMARY_ATTRIBUTES,
            parse: parsePostSummaryItem,
            idOf: (row) => row.id,
          },
        );
      },
    );
  }

  async create(input: CreatePostRequest): Promise<Post> {
    const title = input.title?.trim() || 'Untitled';
    return this.insertDraft({
      id: ulid(),
      slug: slugify(input.slug?.trim() || title),
      title,
      excerpt: input.excerpt ?? '',
      bodyMarkdown: input.bodyMarkdown ?? '',
      tags: normalizeTags(input.tags ?? []),
      projectIds: [...new Set(input.projectIds ?? [])],
      status: 'draft',
      publishedAt: null,
      updatedAt: this.now(),
      coverImage: input.coverImage ?? null,
      seo: input.seo ?? null,
      version: 1,
      hasUnpublishedChanges: false,
    });
  }

  async update(postId: string, input: UpdatePostRequest): Promise<Post> {
    return this.mutate(postId, input.version, (existing) => ({
      ...existing,
      title: input.title ?? existing.title,
      slug: input.slug ? slugify(input.slug) : existing.slug,
      excerpt: input.excerpt ?? existing.excerpt,
      bodyMarkdown: input.bodyMarkdown ?? existing.bodyMarkdown,
      tags: input.tags ? normalizeTags(input.tags) : existing.tags,
      projectIds: input.projectIds
        ? [...new Set(input.projectIds)]
        : existing.projectIds,
      coverImage:
        input.coverImage !== undefined ? input.coverImage : existing.coverImage,
      seo: input.seo !== undefined ? input.seo : existing.seo,
    }));
  }
}
