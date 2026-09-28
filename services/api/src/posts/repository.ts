import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  CreatePostRequest,
  Post,
  PostStatus,
  UpdatePostRequest,
} from '@gagnechris/shared';
import { batchGetAllWithDocClient } from '@gagnechris/shared';
import { ulid } from 'ulid';
import { getDocClient, requireTableName } from '../data/client.js';
import { decodeCursor, encodeCursor } from '../data/cursor.js';
import { runDynamoWrite } from '../data/dynamo-write.js';
import {
  PublishableKeyedRepository,
  assertExpectedVersion,
  nowIso,
  withUnpublishedFlag,
  type PersistPublishOptions,
} from '../data/publishable-repository.js';
import {
  buildMetaItem,
  buildPublishedItem,
  metaToPost,
  normalizeTags,
  parsePostMetaItem,
  postContentEqual,
  postMetaSk,
  postPk,
  postPublishedSk,
  slugify,
  slugPk,
  slugPostSk,
  statusGsi1Pk,
  type PostMetaItem,
} from './keys.js';
import { buildDraftMutationItems } from './mutation-builders.js';

export { ConflictError, NotFoundError } from '../data/errors.js';

export class PostsRepository extends PublishableKeyedRepository<
  Post,
  PostMetaItem
> {
  constructor(
    doc: DynamoDBDocumentClient = getDocClient(),
    tableName: string = requireTableName(),
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
      },
      doc,
      tableName,
    );
  }

  protected async persistMutation(
    before: Post,
    after: Post,
    options: PersistPublishOptions<Post>,
  ): Promise<void> {
    const syncPublished = Boolean(options.syncPublished);
    const deletePublished = Boolean(options.deletePublished);
    await this.writeDraftMutation(before, after, {
      syncTags: syncPublished || deletePublished,
      writePublished: syncPublished,
      deletePublished,
      previousPublished: options.previousPublished,
    });
  }

  /**
   * Persist META (+ slug bookkeeping). Optionally sync the PUBLISHED snapshot
   * and public tag index. Publisher rebuilds only on PUBLISHED stream events.
   */
  private async writeDraftMutation(
    before: Post,
    after: Post,
    options: {
      syncTags?: boolean;
      writePublished?: boolean;
      deletePublished?: boolean;
      previousPublished?: Post;
    } = {},
  ): Promise<void> {
    const transactItems = buildDraftMutationItems(
      this.tableName,
      before,
      after,
      options,
    );
    await runDynamoWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({ TransactItems: transactItems }),
        ),
      'Update conflict (version or slug)',
    );
  }

  async getBySlug(slug: string): Promise<Post | undefined> {
    const normalized = slugify(slug);
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: slugPk(normalized), sk: slugPostSk() },
      }),
    );
    const postId = result.Item?.postId;
    if (typeof postId !== 'string' || !postId) return undefined;
    return this.getById(postId);
  }

  async list(
    status?: PostStatus,
    opts?: { cursor?: string; limit?: number },
  ): Promise<{ items: Post[]; nextCursor?: string }> {
    const statuses: PostStatus[] = status ? [status] : ['draft', 'published'];

    // Single-status queries can page via LastEvaluatedKey. Multi-status
    // (default admin list) still merges pages in memory (small catalogs).
    if (statuses.length === 1) {
      const s = statuses[0]!;
      const exclusiveStartKey = decodeCursor(opts?.cursor);
      const result = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'gsi1',
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: { ':pk': statusGsi1Pk(s) },
          ScanIndexForward: false,
          ExclusiveStartKey: exclusiveStartKey,
          Limit: opts?.limit,
        }),
      );
      const drafts = (result.Items ?? [])
        .filter(
          (item) => item.entityType === 'post' && item.sk === postMetaSk(),
        )
        .map((item) => metaToPost(parsePostMetaItem(item)));

      const items = await this.attachUnpublishedFlags(drafts);
      return {
        items,
        nextCursor: encodeCursor(
          result.LastEvaluatedKey as Record<string, unknown> | undefined,
        ),
      };
    }

    const batches = await Promise.all(
      statuses.map(async (s) => {
        const result = await this.doc.send(
          new QueryCommand({
            TableName: this.tableName,
            IndexName: 'gsi1',
            KeyConditionExpression: 'gsi1pk = :pk',
            ExpressionAttributeValues: { ':pk': statusGsi1Pk(s) },
            ScanIndexForward: false,
          }),
        );
        return (result.Items ?? [])
          .filter(
            (item) => item.entityType === 'post' && item.sk === postMetaSk(),
          )
          .map((item) => metaToPost(parsePostMetaItem(item)));
      }),
    );
    const drafts = batches
      .flat()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return { items: await this.attachUnpublishedFlags(drafts) };
  }

  private async attachUnpublishedFlags(drafts: Post[]): Promise<Post[]> {
    const publishedDrafts = drafts.filter((d) => d.status === 'published');
    const publishedById = await this.batchGetPublished(
      publishedDrafts.map((d) => d.id),
    );

    const items: Post[] = [];
    for (const draft of drafts) {
      if (draft.status !== 'published') {
        items.push(withUnpublishedFlag(draft, undefined, postContentEqual));
        continue;
      }
      let published = publishedById.get(draft.id);
      if (!published) {
        // Migration path: keyed base putPublishedIfAbsent via loadDraftAndPublished
        const loaded = await this.loadDraftAndPublished(draft.id);
        published = loaded?.published;
      }
      items.push(withUnpublishedFlag(draft, published, postContentEqual));
    }
    return items;
  }

  /** BatchGet PUBLISHED snapshots (chunks of 100); retries UnprocessedKeys (CHR-120). */
  private async batchGetPublished(
    postIds: string[],
  ): Promise<Map<string, Post>> {
    const map = new Map<string, Post>();
    const unique = [...new Set(postIds.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      if (chunk.length === 0) continue;
      const responses = await batchGetAllWithDocClient(
        async (RequestItems) =>
          this.doc.send(new BatchGetCommand({ RequestItems })),
        {
          [this.tableName]: {
            Keys: chunk.map((id) => ({
              pk: postPk(id),
              sk: postPublishedSk(),
            })),
          },
        },
      );
      for (const item of responses[this.tableName] ?? []) {
        const post = metaToPost(parsePostMetaItem(item), false);
        map.set(post.id, post);
      }
    }
    return map;
  }

  async create(input: CreatePostRequest): Promise<Post> {
    const id = ulid();
    const updatedAt = nowIso();
    const title = input.title?.trim() || 'Untitled';
    const slug = slugify(input.slug?.trim() || title);
    const tags = normalizeTags(input.tags ?? []);
    const post: Post = {
      id,
      slug,
      title,
      excerpt: input.excerpt ?? '',
      bodyMarkdown: input.bodyMarkdown ?? '',
      tags,
      status: 'draft',
      publishedAt: null,
      updatedAt,
      coverImage: input.coverImage ?? null,
      seo: input.seo ?? null,
      version: 1,
      hasUnpublishedChanges: false,
    };
    const meta = buildMetaItem(post);

    await runDynamoWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.tableName,
                  Item: {
                    pk: slugPk(slug),
                    sk: slugPostSk(),
                    entityType: 'slug',
                    postId: id,
                  },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
              {
                Put: {
                  TableName: this.tableName,
                  Item: meta,
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
            ],
          }),
        ),
      `Slug "${slug}" is already taken`,
    );

    return post;
  }

  async update(postId: string, input: UpdatePostRequest): Promise<Post> {
    const existing = await this.getByIdOrThrow(postId);
    assertExpectedVersion(existing, input.version);

    const nextSlug = input.slug ? slugify(input.slug) : existing.slug;
    const nextTags = input.tags ? normalizeTags(input.tags) : existing.tags;
    const updatedAt = nowIso();
    const next: Post = {
      ...existing,
      title: input.title ?? existing.title,
      slug: nextSlug,
      excerpt: input.excerpt ?? existing.excerpt,
      bodyMarkdown: input.bodyMarkdown ?? existing.bodyMarkdown,
      tags: nextTags,
      coverImage:
        input.coverImage !== undefined ? input.coverImage : existing.coverImage,
      seo: input.seo !== undefined ? input.seo : existing.seo,
      updatedAt,
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };

    // Draft edits never rewrite the public tag index — that stays tied to PUBLISHED.
    await this.writeDraftMutation(existing, next, { syncTags: false });
    const published = await this.getPublished(postId);
    return withUnpublishedFlag(next, published, postContentEqual);
  }

  async softDelete(postId: string, expectedVersion?: number): Promise<Post> {
    const existing = await this.getByIdOrThrow(postId);
    assertExpectedVersion(existing, expectedVersion);
    const published = await this.getPublished(postId);
    const updatedAt = nowIso();
    const next: Post = {
      ...existing,
      status: 'deleted',
      updatedAt,
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraftMutation(existing, next, {
      syncTags: true,
      deletePublished: true,
      previousPublished: published,
    });
    return next;
  }
}
