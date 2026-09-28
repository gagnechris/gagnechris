import {
  BatchGetCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
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
import { batchGetAllWithDocClient, isOptimisticLockConflict } from '@gagnechris/shared';
import { ulid } from 'ulid';
import { getDocClient, requireTableName } from '../data/client.js';
import { decodeCursor, encodeCursor } from '../data/cursor.js';
import { runDynamoWrite } from '../data/dynamo-write.js';
import { ConflictError, NotFoundError } from '../data/errors.js';
import {
  buildMetaItem,
  buildPublishedItem,
  metaToPost,
  normalizeTags,
  nowIso,
  parsePostMetaItem,
  postContentEqual,
  postMetaSk,
  postPk,
  postPublishedSk,
  slugify,
  slugPk,
  slugPostSk,
  slugRedirectSk,
  statusGsi1Pk,
  tagPk,
  tagSk,
} from './keys.js';

export { ConflictError, NotFoundError } from '../data/errors.js';

export class PostsRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
  ) {}

  async getPublished(postId: string): Promise<Post | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: postPk(postId), sk: postPublishedSk() },
      }),
    );
    if (!result.Item) return undefined;
    return metaToPost(parsePostMetaItem(result.Item), false);
  }

  async getById(postId: string): Promise<Post | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: postPk(postId), sk: postMetaSk() },
      }),
    );
    if (!result.Item) return undefined;
    const draft = metaToPost(parsePostMetaItem(result.Item));
    if (draft.status === 'deleted') return undefined;
    await this.migratePublishedSnapshot(draft);
    const published = await this.getPublished(postId);
    return this.withUnpublishedFlag(draft, published);
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
    const statuses: PostStatus[] = status
      ? [status]
      : ['draft', 'published'];

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

      const publishedDrafts = drafts.filter((d) => d.status === 'published');
      const publishedById = await this.batchGetPublished(
        publishedDrafts.map((d) => d.id),
      );

      const items: Post[] = [];
      for (const draft of drafts) {
        if (draft.status !== 'published') {
          items.push(this.withUnpublishedFlag(draft, undefined));
          continue;
        }
        let published = publishedById.get(draft.id);
        if (!published) {
          await this.migratePublishedSnapshot(draft);
          published = await this.getPublished(draft.id);
        }
        items.push(this.withUnpublishedFlag(draft, published));
      }
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

    const publishedDrafts = drafts.filter((d) => d.status === 'published');
    const publishedById = await this.batchGetPublished(
      publishedDrafts.map((d) => d.id),
    );

    const items: Post[] = [];
    for (const draft of drafts) {
      if (draft.status !== 'published') {
        items.push(this.withUnpublishedFlag(draft, undefined));
        continue;
      }
      let published = publishedById.get(draft.id);
      if (!published) {
        await this.migratePublishedSnapshot(draft);
        published = await this.getPublished(draft.id);
      }
      items.push(this.withUnpublishedFlag(draft, published));
    }
    return { items };
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
    const existing = await this.getById(postId);
    if (!existing) {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    if (existing.version !== input.version) {
      throw new ConflictError(
        `Version conflict: expected ${input.version}, current ${existing.version}`,
        { currentVersion: existing.version, current: existing },
      );
    }

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
    return this.withUnpublishedFlag(next, published);
  }

  /**
   * Copies draft META → PUBLISHED (and syncs tag index). Re-publish after
   * edits is intentional — no longer a no-op when already published.
   */
  async publish(
    postId: string,
    options?: { publishedAt?: string; version?: number },
  ): Promise<Post> {
    const existing = await this.getById(postId);
    if (!existing) {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    if (
      options?.version !== undefined &&
      existing.version !== options.version
    ) {
      throw new ConflictError(
        `Version conflict: expected ${options.version}, current ${existing.version}`,
        { currentVersion: existing.version, current: existing },
      );
    }
    const published = await this.getPublished(postId);
    if (
      existing.status === 'published' &&
      published &&
      postContentEqual(existing, published)
    ) {
      return this.withUnpublishedFlag(existing, published);
    }
    const updatedAt = nowIso();
    const publishedAt =
      existing.publishedAt ?? options?.publishedAt ?? updatedAt;
    const next: Post = {
      ...existing,
      status: 'published',
      publishedAt,
      updatedAt,
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraftMutation(existing, next, {
      syncTags: true,
      writePublished: true,
      previousPublished: published,
    });
    return this.withUnpublishedFlag(next, next);
  }

  async unpublish(postId: string, expectedVersion?: number): Promise<Post> {
    const existing = await this.getById(postId);
    if (!existing) {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    if (
      expectedVersion !== undefined &&
      existing.version !== expectedVersion
    ) {
      throw new ConflictError(
        `Version conflict: expected ${expectedVersion}, current ${existing.version}`,
        { currentVersion: existing.version, current: existing },
      );
    }
    if (existing.status === 'draft') {
      return this.withUnpublishedFlag(existing, undefined);
    }
    const published = await this.getPublished(postId);
    const updatedAt = nowIso();
    const next: Post = {
      ...existing,
      status: 'draft',
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

  async discard(postId: string, expectedVersion?: number): Promise<Post> {
    const existing = await this.getById(postId);
    if (!existing) {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    if (
      expectedVersion !== undefined &&
      existing.version !== expectedVersion
    ) {
      throw new ConflictError(
        `Version conflict: expected ${expectedVersion}, current ${existing.version}`,
        { currentVersion: existing.version, current: existing },
      );
    }
    const published = await this.getPublished(postId);
    if (!published) {
      return this.withUnpublishedFlag(existing, undefined);
    }
    if (postContentEqual(existing, published)) {
      return this.withUnpublishedFlag(existing, published);
    }
    const next: Post = {
      ...published,
      status: 'published',
      publishedAt: existing.publishedAt ?? published.publishedAt,
      updatedAt: nowIso(),
      version: existing.version + 1,
      hasUnpublishedChanges: false,
    };
    await this.writeDraftMutation(existing, next, { syncTags: false });
    return this.withUnpublishedFlag(next, published);
  }

  async softDelete(postId: string, expectedVersion?: number): Promise<Post> {
    const existing = await this.getById(postId);
    if (!existing) {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    if (
      expectedVersion !== undefined &&
      existing.version !== expectedVersion
    ) {
      throw new ConflictError(
        `Version conflict: expected ${expectedVersion}, current ${existing.version}`,
        { currentVersion: existing.version, current: existing },
      );
    }
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

  /**
   * One-time cutover: if META is already published and PUBLISHED is missing,
   * copy META → PUBLISHED so the live site stays unchanged.
   */
  private async migratePublishedSnapshot(draft: Post): Promise<void> {
    if (draft.status !== 'published') return;
    const published = await this.getPublished(draft.id);
    if (published) return;
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: buildPublishedItem(draft),
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (error) {
      if (isOptimisticLockConflict(error)) return;
      throw error;
    }
  }

  private withUnpublishedFlag(
    draft: Post,
    published: Post | undefined,
  ): Post {
    return {
      ...draft,
      hasUnpublishedChanges:
        draft.status === 'published' &&
        published !== undefined &&
        !postContentEqual(draft, published),
    };
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
    const meta = buildMetaItem(after);
    const transactItems: NonNullable<
      ConstructorParameters<typeof TransactWriteCommand>[0]
    >['TransactItems'] = [
      {
        Put: {
          TableName: this.tableName,
          Item: meta,
          ConditionExpression: 'attribute_not_exists(version) OR version = :v',
          ExpressionAttributeValues: { ':v': before.version },
        },
      },
    ];

    if (before.slug !== after.slug) {
      transactItems.push(
        {
          Delete: {
            TableName: this.tableName,
            Key: { pk: slugPk(before.slug), sk: slugPostSk() },
            ConditionExpression: 'postId = :id',
            ExpressionAttributeValues: { ':id': before.id },
          },
        },
        {
          Put: {
            TableName: this.tableName,
            Item: {
              pk: slugPk(before.slug),
              sk: slugRedirectSk(),
              entityType: 'slugRedirect',
              postId: before.id,
              targetSlug: after.slug,
            },
          },
        },
        {
          Put: {
            TableName: this.tableName,
            Item: {
              pk: slugPk(after.slug),
              sk: slugPostSk(),
              entityType: 'slug',
              postId: after.id,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      );
    }

    if (options.writePublished) {
      transactItems.push({
        Put: {
          TableName: this.tableName,
          Item: buildPublishedItem(after),
        },
      });
    }

    if (options.deletePublished) {
      transactItems.push({
        Delete: {
          TableName: this.tableName,
          Key: { pk: postPk(after.id), sk: postPublishedSk() },
        },
      });
    }

    if (options.syncTags) {
      const previous = options.previousPublished;
      const beforeTags = previous?.tags ?? [];
      const beforePublishedAt = previous?.publishedAt ?? null;
      const afterTags =
        options.writePublished && after.status === 'published'
          ? after.tags
          : ([] as string[]);
      const afterPublishedAt =
        options.writePublished && after.status === 'published'
          ? after.publishedAt
          : null;

      for (const tag of beforeTags) {
        if (!beforePublishedAt) continue;
        const still =
          afterTags.includes(tag) &&
          afterPublishedAt === beforePublishedAt &&
          Boolean(options.writePublished);
        if (still) continue;
        transactItems.push({
          Delete: {
            TableName: this.tableName,
            Key: {
              pk: tagPk(tag),
              sk: tagSk(beforePublishedAt, before.id),
            },
          },
        });
      }
      for (const tag of afterTags) {
        if (!afterPublishedAt) continue;
        const already =
          beforeTags.includes(tag) &&
          beforePublishedAt === afterPublishedAt;
        if (already) continue;
        transactItems.push({
          Put: {
            TableName: this.tableName,
            Item: {
              pk: tagPk(tag),
              sk: tagSk(afterPublishedAt, after.id),
              gsi2pk: tagPk(tag),
              gsi2sk: tagSk(afterPublishedAt, after.id),
              entityType: 'tagIndex',
              postId: after.id,
              slug: after.slug,
            },
          },
        });
      }
    }

    // Soft-delete: drop active slug claim so the slug can be reused later.
    if (after.status === 'deleted' && before.status !== 'deleted') {
      transactItems.push({
        Delete: {
          TableName: this.tableName,
          Key: { pk: slugPk(after.slug), sk: slugPostSk() },
        },
      });
    }

    await runDynamoWrite(
      () =>
        this.doc.send(new TransactWriteCommand({ TransactItems: transactItems })),
      'Update conflict (version or slug)',
    );
  }
}

/** Test helper: wipe is not provided — use a dedicated test table / mock. */
export async function putMetaForTests(
  doc: DynamoDBDocumentClient,
  tableName: string,
  post: Post,
): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: tableName,
      Item: buildMetaItem(post),
    }),
  );
}

export async function deleteMetaForTests(
  doc: DynamoDBDocumentClient,
  tableName: string,
  postId: string,
): Promise<void> {
  await doc.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { pk: postPk(postId), sk: postMetaSk() },
    }),
  );
}
