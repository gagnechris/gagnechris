import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
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
import { ulid } from 'ulid';
import { getDocClient, requireTableName } from '../data/client.js';
import { ConflictError, NotFoundError } from '../data/errors.js';
import {
  buildMetaItem,
  metaToPost,
  normalizeTags,
  nowIso,
  postMetaSk,
  postPk,
  slugify,
  slugPk,
  slugPostSk,
  slugRedirectSk,
  statusGsi1Pk,
  tagPk,
  tagSk,
  type PostMetaItem,
} from './keys.js';

export { ConflictError, NotFoundError } from '../data/errors.js';

export class PostsRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient = getDocClient(),
    private readonly tableName: string = requireTableName(),
  ) {}

  async getById(postId: string): Promise<Post | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: postPk(postId), sk: postMetaSk() },
      }),
    );
    if (!result.Item) return undefined;
    return metaToPost(result.Item as PostMetaItem);
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

  async list(status?: PostStatus): Promise<Post[]> {
    const statuses: PostStatus[] = status
      ? [status]
      : ['draft', 'published'];
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
          .filter((item) => item.entityType === 'post')
          .map((item) => metaToPost(item as PostMetaItem));
      }),
    );
    return batches
      .flat()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
    };
    const meta = buildMetaItem(post);

    try {
      await this.doc.send(
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
      );
    } catch (error) {
      if (
        error instanceof TransactionCanceledException ||
        error instanceof ConditionalCheckFailedException
      ) {
        throw new ConflictError(`Slug "${slug}" is already taken`);
      }
      throw error;
    }

    return post;
  }

  async update(postId: string, input: UpdatePostRequest): Promise<Post> {
    const existing = await this.getById(postId);
    if (!existing || existing.status === 'deleted') {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    if (existing.version !== input.version) {
      throw new ConflictError(
        `Version conflict: expected ${input.version}, current ${existing.version}`,
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
    };

    await this.writePostMutation(existing, next);
    return next;
  }

  async publish(
    postId: string,
    options?: { publishedAt?: string },
  ): Promise<Post> {
    const existing = await this.getById(postId);
    if (!existing || existing.status === 'deleted') {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    if (existing.status === 'published') {
      return existing;
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
    };
    await this.writePostMutation(existing, next);
    return next;
  }

  async unpublish(postId: string): Promise<Post> {
    const existing = await this.getById(postId);
    if (!existing || existing.status === 'deleted') {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    if (existing.status === 'draft') {
      return existing;
    }
    const updatedAt = nowIso();
    const next: Post = {
      ...existing,
      status: 'draft',
      updatedAt,
      version: existing.version + 1,
    };
    await this.writePostMutation(existing, next);
    return next;
  }

  async softDelete(postId: string): Promise<Post> {
    const existing = await this.getById(postId);
    if (!existing || existing.status === 'deleted') {
      throw new NotFoundError(`Post ${postId} not found`);
    }
    const updatedAt = nowIso();
    const next: Post = {
      ...existing,
      status: 'deleted',
      updatedAt,
      version: existing.version + 1,
    };
    await this.writePostMutation(existing, next);
    return next;
  }

  /**
   * Persist META (+ slug/tag bookkeeping). Publisher is notified via
   * DynamoDB Streams on META changes (CHR-34) — no separate EventBridge bus.
   */
  private async writePostMutation(before: Post, after: Post): Promise<void> {
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

    // Tag index rows only for published posts (public browse).
    const beforeTags =
      before.status === 'published' ? before.tags : ([] as string[]);
    const afterTags =
      after.status === 'published' ? after.tags : ([] as string[]);
    const beforePublishedAt = before.publishedAt;
    const afterPublishedAt = after.publishedAt;

    for (const tag of beforeTags) {
      if (!beforePublishedAt) continue;
      const still =
        afterTags.includes(tag) &&
        afterPublishedAt === beforePublishedAt &&
        after.status === 'published';
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
        beforePublishedAt === afterPublishedAt &&
        before.status === 'published';
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

    // Soft-delete: drop active slug claim so the slug can be reused later.
    if (after.status === 'deleted' && before.status !== 'deleted') {
      transactItems.push({
        Delete: {
          TableName: this.tableName,
          Key: { pk: slugPk(after.slug), sk: slugPostSk() },
        },
      });
    }

    try {
      await this.doc.send(new TransactWriteCommand({ TransactItems: transactItems }));
    } catch (error) {
      if (
        error instanceof TransactionCanceledException ||
        error instanceof ConditionalCheckFailedException
      ) {
        throw new ConflictError('Update conflict (version or slug)');
      }
      throw error;
    }
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
