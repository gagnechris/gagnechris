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
import {
  ConflictError,
  NotFoundError,
  PostsRepository,
} from './repository.js';

function json(
  statusCode: number,
  body: unknown,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function parseBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new SyntaxError('Invalid JSON body');
  }
}

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
    if (error instanceof SyntaxError) {
      return json(400, { error: 'bad_request', message: error.message });
    }
    if (error instanceof NotFoundError) {
      return json(404, { error: 'not_found', message: error.message });
    }
    if (error instanceof ConflictError) {
      return json(409, { error: 'conflict', message: error.message });
    }
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      (error as { name: string }).name === 'ZodError'
    ) {
      return json(400, {
        error: 'bad_request',
        message: 'Invalid request body or query',
      });
    }
    throw error;
  }
}
