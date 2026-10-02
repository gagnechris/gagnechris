import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import type {
  CreatePostRequest,
  Post,
  PostStatus,
  UpdatePostRequest,
} from '@gagnechris/shared';
import { GSI1_NAME, batchGetAllWithDocClient } from '@gagnechris/data';
import { ulid } from 'ulid';
import { getDocClient, requireTableName } from '../data/client.js';
import {
  decodeCursor,
  encodeCursor,
  GSI1_CURSOR_KEYS,
} from '../data/cursor.js';
import { runDynamoWrite } from '../data/dynamo-write.js';
import { DataIntegrityError, NotFoundError } from '../data/errors.js';
import {
  PublishableRepository,
  assertExpectedVersion,
  nowIso,
  withUnpublishedFlag,
  type PersistPublishOptions,
} from '../data/publishable-repository.js';
import {
  runVersionedWrite,
  throwVersionConflict,
} from '../data/version-condition.js';
import { logger, metrics } from '../observability.js';
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

type MultiStatusCursor = {
  i: number;
  lek?: Record<string, unknown>;
};

function encodeMultiStatusCursor(
  cursor: MultiStatusCursor | undefined,
): string | undefined {
  if (!cursor) return undefined;
  return encodeCursor(cursor as unknown as Record<string, unknown>);
}

function decodeMultiStatusCursor(
  cursor: string | undefined,
): MultiStatusCursor {
  if (!cursor?.trim()) return { i: 0 };
  const raw = decodeCursor(cursor);
  if (
    !raw ||
    typeof raw.i !== 'number' ||
    !Number.isInteger(raw.i) ||
    raw.i < 0
  ) {
    throw new SyntaxError('Invalid pagination cursor');
  }
  const lek = raw.lek;
  if (lek !== undefined) {
    if (!lek || typeof lek !== 'object' || Array.isArray(lek)) {
      throw new SyntaxError('Invalid pagination cursor');
    }
    const lekObj = lek as Record<string, unknown>;
    const names = Object.keys(lekObj);
    if (names.length !== GSI1_CURSOR_KEYS.length) {
      throw new SyntaxError('Invalid pagination cursor');
    }
    for (const name of GSI1_CURSOR_KEYS) {
      if (typeof lekObj[name] !== 'string') {
        throw new SyntaxError('Invalid pagination cursor');
      }
    }
  }
  return {
    i: raw.i,
    lek: lek as Record<string, unknown> | undefined,
  };
}

function assertGsi1CursorForStatus(
  key: Record<string, unknown> | undefined,
  status: PostStatus,
): void {
  if (!key) return;
  if (key.gsi1pk !== statusGsi1Pk(status)) {
    throw new SyntaxError('Invalid pagination cursor');
  }
}

function logCorruptItem(error: DataIntegrityError): void {
  logger.warn('Skipping corrupt stored item', {
    pk: error.pk,
    sk: error.sk,
    errMessage: error.message,
    causeMessage:
      error.cause instanceof Error ? error.cause.message : undefined,
  });
  metrics.addMetric('DataIntegrityError', MetricUnit.Count, 1);
}

export class PostsRepository extends PublishableRepository<Post, PostMetaItem> {
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
        cursorKeyNames: GSI1_CURSOR_KEYS,
      },
      doc,
      tableName,
    );
  }

  async persistMutation(
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
    const { items: transactItems, slugClaimIndexes } = buildDraftMutationItems(
      this.tableName,
      before,
      after,
      options,
    );
    await runVersionedWrite(
      () =>
        this.doc.send(
          new TransactWriteCommand({ TransactItems: transactItems }),
        ),
      'Update conflict (version)',
      () =>
        throwVersionConflict(before.version, () =>
          this.getById(after.id, { consistentRead: true }),
        ),
      {
        slugClaimIndexes,
        slugTakenMessage: `Slug "${after.slug}" is already taken`,
      },
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
    const statuses: PostStatus[] = status
      ? [status]
      : // Published first so admin "all" pages surface live posts before drafts
        // (CHR-161). Status filter still queries a single GSI partition.
        ['published', 'draft'];
    if (statuses.length === 1) {
      return this.listSingleStatus(statuses[0]!, opts);
    }
    return this.listMultiStatus(statuses, {
      cursor: opts?.cursor,
      limit: opts?.limit,
    });
  }

  private async listSingleStatus(
    status: PostStatus,
    opts?: { cursor?: string; limit?: number },
  ): Promise<{ items: Post[]; nextCursor?: string }> {
    const exclusiveStartKey = decodeCursor(opts?.cursor, GSI1_CURSOR_KEYS);
    assertGsi1CursorForStatus(exclusiveStartKey, status);
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: GSI1_NAME,
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': statusGsi1Pk(status) },
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: opts?.limit,
      }),
    );
    const drafts = this.parseListItems(result.Items ?? []);
    return {
      items: await this.attachUnpublishedFlags(drafts),
      nextCursor: encodeCursor(
        result.LastEvaluatedKey as Record<string, unknown> | undefined,
      ),
    };
  }

  private async listMultiStatus(
    statuses: PostStatus[],
    opts: { cursor?: string; limit?: number },
  ): Promise<{ items: Post[]; nextCursor?: string }> {
    let state = decodeMultiStatusCursor(opts.cursor);
    const limit = opts.limit;
    const collected: Post[] = [];

    while (state.i < statuses.length) {
      const status = statuses[state.i]!;
      assertGsi1CursorForStatus(state.lek, status);
      const remaining =
        limit !== undefined ? Math.max(limit - collected.length, 1) : undefined;
      const result = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: GSI1_NAME,
          KeyConditionExpression: 'gsi1pk = :pk',
          ExpressionAttributeValues: { ':pk': statusGsi1Pk(status) },
          ScanIndexForward: false,
          ExclusiveStartKey: state.lek,
          Limit: remaining,
        }),
      );
      collected.push(...this.parseListItems(result.Items ?? []));
      const lek = result.LastEvaluatedKey as
        Record<string, unknown> | undefined;
      if (lek && Object.keys(lek).length > 0) {
        return {
          items: await this.attachUnpublishedFlags(collected),
          nextCursor: encodeMultiStatusCursor({ i: state.i, lek }),
        };
      }
      state = { i: state.i + 1 };
      if (limit !== undefined && collected.length >= limit) {
        if (state.i < statuses.length) {
          return {
            items: await this.attachUnpublishedFlags(collected),
            nextCursor: encodeMultiStatusCursor({ i: state.i }),
          };
        }
        break;
      }
    }
    return { items: await this.attachUnpublishedFlags(collected) };
  }

  private parseListItems(rawItems: Record<string, unknown>[]): Post[] {
    const drafts: Post[] = [];
    for (const item of rawItems) {
      if (item.entityType !== 'post' || item.sk !== postMetaSk()) continue;
      try {
        const post = metaToPost(parsePostMetaItem(item));
        if (post.status === 'deleted') continue;
        drafts.push(post);
      } catch (error) {
        const pk = typeof item.pk === 'string' ? item.pk : undefined;
        const sk = typeof item.sk === 'string' ? item.sk : undefined;
        logCorruptItem(
          new DataIntegrityError('Corrupt stored Post', {
            pk,
            sk,
            cause: error,
          }),
        );
      }
    }
    return drafts;
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
      const published = publishedById.get(draft.id);
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
        try {
          const post = metaToPost(parsePostMetaItem(item), false);
          map.set(post.id, post);
        } catch (error) {
          const raw = item as { pk?: string; sk?: string };
          logCorruptItem(
            new DataIntegrityError('Corrupt stored Post', {
              pk: typeof raw.pk === 'string' ? raw.pk : undefined,
              sk: typeof raw.sk === 'string' ? raw.sk : undefined,
              cause: error,
            }),
          );
        }
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
      {
        slugClaimIndexes: [0],
        slugTakenMessage: `Slug "${slug}" is already taken`,
      },
    );

    return post;
  }

  async update(postId: string, input: UpdatePostRequest): Promise<Post> {
    const loaded = await this.loadDraftAndPublished(postId);
    if (!loaded) {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    const existing = withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      postContentEqual,
    );
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

    await this.writeDraftMutation(existing, next, { syncTags: false });
    return withUnpublishedFlag(next, loaded.published, postContentEqual);
  }

  async softDelete(postId: string, expectedVersion: number): Promise<Post> {
    const loaded = await this.loadDraftAndPublished(postId);
    if (!loaded) {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    const existing = withUnpublishedFlag(
      loaded.draft,
      loaded.published,
      postContentEqual,
    );
    assertExpectedVersion(existing, expectedVersion);
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
      previousPublished: loaded.published,
    });
    return next;
  }
}
