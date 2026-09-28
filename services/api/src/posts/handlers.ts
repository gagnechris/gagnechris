import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { z } from 'zod';
import {
  CreatePostRequestSchema,
  ExpectedVersionRequestSchema,
  PostListResponseSchema,
  PostSchema,
  PostStatusSchema,
  UpdatePostRequestSchema,
} from '@gagnechris/shared';
import { json } from '../http.js';
import {
  dispatchRoutes,
  type RouteDef,
  type RouteHandler,
} from '../router.js';
import { PostsRepository } from './repository.js';

const IdParams = z.object({ id: z.string().min(1) });
const ListQuery = z.object({
  status: PostStatusSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

function postsHandlers(repo?: PostsRepository): {
  list: RouteHandler;
  create: RouteHandler;
  get: RouteHandler;
  update: RouteHandler;
  softDelete: RouteHandler;
  publish: RouteHandler;
  unpublish: RouteHandler;
  discard: RouteHandler;
} {
  const posts = () => repo ?? new PostsRepository();
  return {
    list: async (_ctx, { query }) => {
      const { status, cursor, limit } = query as z.infer<typeof ListQuery>;
      const page = await posts().list(status, { cursor, limit });
      return json(200, PostListResponseSchema.parse(page));
    },
    create: async (_ctx, { body }) => {
      const post = await posts().create(
        body as z.infer<typeof CreatePostRequestSchema>,
      );
      return json(201, PostSchema.parse(post));
    },
    get: async (_ctx, { params }) => {
      const { id } = params as z.infer<typeof IdParams>;
      const post = await posts().getById(id);
      if (!post) {
        return json(404, {
          error: 'not_found',
          message: `Post ${id} not found`,
        });
      }
      return json(200, PostSchema.parse(post));
    },
    update: async (_ctx, { params, body }) => {
      const { id } = params as z.infer<typeof IdParams>;
      const post = await posts().update(
        id,
        body as z.infer<typeof UpdatePostRequestSchema>,
      );
      return json(200, PostSchema.parse(post));
    },
    softDelete: async (_ctx, { params, body }) => {
      const { id } = params as z.infer<typeof IdParams>;
      const { version } = body as z.infer<typeof ExpectedVersionRequestSchema>;
      const post = await posts().softDelete(id, version);
      return json(200, PostSchema.parse(post));
    },
    publish: async (_ctx, { params, body }) => {
      const { id } = params as z.infer<typeof IdParams>;
      const { version } = body as z.infer<typeof ExpectedVersionRequestSchema>;
      const post = await posts().publish(id, { version });
      return json(200, PostSchema.parse(post));
    },
    unpublish: async (_ctx, { params, body }) => {
      const { id } = params as z.infer<typeof IdParams>;
      const { version } = body as z.infer<typeof ExpectedVersionRequestSchema>;
      const post = await posts().unpublish(id, version);
      return json(200, PostSchema.parse(post));
    },
    discard: async (_ctx, { params, body }) => {
      const { id } = params as z.infer<typeof IdParams>;
      const { version } = body as z.infer<typeof ExpectedVersionRequestSchema>;
      const post = await posts().discard(id, version);
      return json(200, PostSchema.parse(post));
    },
  };
}

export function createPostRoutes(repo?: PostsRepository): RouteDef[] {
  const h = postsHandlers(repo);
  return [
    {
      method: 'GET',
      pattern: '/admin/posts',
      auth: 'admin',
      metric: 'ListPosts',
      query: ListQuery,
      handler: h.list,
    },
    {
      method: 'POST',
      pattern: '/admin/posts',
      auth: 'admin',
      metric: 'CreatePost',
      body: CreatePostRequestSchema,
      handler: h.create,
    },
    {
      method: 'GET',
      pattern: '/admin/posts/:id',
      auth: 'admin',
      metric: 'GetPost',
      params: IdParams,
      handler: h.get,
    },
    {
      method: 'PUT',
      pattern: '/admin/posts/:id',
      auth: 'admin',
      metric: 'UpdatePost',
      params: IdParams,
      body: UpdatePostRequestSchema,
      handler: h.update,
    },
    {
      method: 'DELETE',
      pattern: '/admin/posts/:id',
      auth: 'admin',
      metric: 'DeletePost',
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: h.softDelete,
    },
    {
      method: 'POST',
      pattern: '/admin/posts/:id/publish',
      auth: 'admin',
      metric: 'PublishPost',
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: h.publish,
    },
    {
      method: 'POST',
      pattern: '/admin/posts/:id/unpublish',
      auth: 'admin',
      metric: 'UnpublishPost',
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: h.unpublish,
    },
    {
      method: 'POST',
      pattern: '/admin/posts/:id/discard',
      auth: 'admin',
      metric: 'DiscardPost',
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: h.discard,
    },
  ];
}

export async function handlePostsRoute(
  event: APIGatewayProxyEventV2,
  method: string,
  path: string,
  repo?: PostsRepository,
): Promise<APIGatewayProxyStructuredResultV2 | undefined> {
  return dispatchRoutes(createPostRoutes(repo), event, method, path, {
    onMiss: 'undefined',
    enforceAuth: false,
  });
}
