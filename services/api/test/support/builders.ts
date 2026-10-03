import type { CreatePostRequest, Post } from '@gagnechris/shared';
import { PostsRepository } from '../../src/posts/repository.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export type IntegrationCtx = {
  readonly tableName: string;
  readonly doc: DynamoDBDocumentClient;
  readonly posts: PostsRepository;
};

export function makeCtx(
  doc: DynamoDBDocumentClient,
  tableName: string,
): IntegrationCtx {
  return {
    tableName,
    doc,
    posts: new PostsRepository(doc, tableName),
  };
}

export type MakePostInput = Partial<CreatePostRequest> & {
  title?: string;
};

export async function makePost(
  ctx: IntegrationCtx,
  input: MakePostInput = {},
): Promise<Post> {
  return ctx.posts.create({
    title: input.title ?? `Integration Post ${Date.now()}`,
    excerpt: input.excerpt ?? '',
    bodyMarkdown: input.bodyMarkdown ?? 'Body',
    tags: input.tags ?? [],
    slug: input.slug,
    coverImage: input.coverImage,
    seo: input.seo,
  });
}
