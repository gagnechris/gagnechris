import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import {
  CreatePostRequestSchema,
  PostListResponseSchema,
  PostSchema,
  PostStatusSchema,
  UpdatePostRequestSchema,
} from '@gagnechris/shared';
import { json, mapRouteError, parseBody } from '../http.js';
import { PostsRepository } from './repository.js';

export async function handlePostsRoute(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
  repo?: PostsRepository,
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  const adminPosts = path.replace(/^\/api/, '');
  // Paths after stripping /api: /admin/posts...
  if (!adminPosts.startsWith('/admin/posts')) {
    return undefined;
  }

  const posts = repo ?? new PostsRepository();

  try {
    if (method === 'GET' && adminPosts === '/admin/posts') {
      const statusRaw = event.queryStringParameters?.status;
      const status = statusRaw
        ? PostStatusSchema.parse(statusRaw)
        : undefined;
      const items = await posts.list(status);
      return json(200, PostListResponseSchema.parse({ items }));
    }

    const publishMatch = /^\/admin\/posts\/([^/]+)\/publish$/.exec(adminPosts);
    if (method === 'POST' && publishMatch) {
      const post = await posts.publish(publishMatch[1]!);
      return json(200, PostSchema.parse(post));
    }

    const unpublishMatch = /^\/admin\/posts\/([^/]+)\/unpublish$/.exec(
      adminPosts,
    );
    if (method === 'POST' && unpublishMatch) {
      const post = await posts.unpublish(unpublishMatch[1]!);
      return json(200, PostSchema.parse(post));
    }

    const discardMatch = /^\/admin\/posts\/([^/]+)\/discard$/.exec(adminPosts);
    if (method === 'POST' && discardMatch) {
      const post = await posts.discard(discardMatch[1]!);
      return json(200, PostSchema.parse(post));
    }

    const byId = /^\/admin\/posts\/([^/]+)$/.exec(adminPosts);
    if (byId) {
      const id = byId[1]!;
      if (method === 'GET') {
        const post = await posts.getById(id);
        if (!post || post.status === 'deleted') {
          return json(404, { error: 'not_found', message: `Post ${id} not found` });
        }
        return json(200, PostSchema.parse(post));
      }
      if (method === 'PUT') {
        const body = UpdatePostRequestSchema.parse(parseBody(event));
        const post = await posts.update(id, body);
        return json(200, PostSchema.parse(post));
      }
      if (method === 'DELETE') {
        const post = await posts.softDelete(id);
        return json(200, PostSchema.parse(post));
      }
    }

    if (method === 'POST' && adminPosts === '/admin/posts') {
      const body = CreatePostRequestSchema.parse(parseBody(event));
      const post = await posts.create(body);
      return json(201, PostSchema.parse(post));
    }

    return undefined;
  } catch (error) {
    const mapped = mapRouteError(error, 'Invalid request body or query');
    if (mapped) return mapped;
    throw error;
  }
}
