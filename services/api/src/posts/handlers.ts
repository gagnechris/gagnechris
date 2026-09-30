import {
  CreatePostRequestSchema,
  ExpectedVersionRequestSchema,
  ListPostsQuerySchema,
  PostListResponseSchema,
  PostSchema,
  UpdatePostRequestSchema,
} from '@gagnechris/shared';
import { z } from 'zod';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { PostsRepository } from './repository.js';

const IdParams = z.object({ id: z.string().min(1) });

export function createPostRoutes(repo?: PostsRepository): RouteDef[] {
  const posts = () => repo ?? new PostsRepository();
  return [
    defineRoute({
      method: 'GET',
      pattern: '/admin/posts',
      auth: 'admin',
      metric: 'ListPosts',
      query: ListPostsQuerySchema,
      handler: async (_ctx, { query }) => {
        const page = await posts().list(query.status, {
          cursor: query.cursor,
          limit: query.limit,
        });
        return json(200, PostListResponseSchema.parse(page));
      },
    }),
    defineRoute({
      method: 'POST',
      pattern: '/admin/posts',
      auth: 'admin',
      metric: 'CreatePost',
      body: CreatePostRequestSchema,
      handler: async (_ctx, { body }) => {
        const post = await posts().create(body);
        return json(201, PostSchema.parse(post));
      },
    }),
    defineRoute({
      method: 'GET',
      pattern: '/admin/posts/:id',
      auth: 'admin',
      metric: 'GetPost',
      params: IdParams,
      handler: async (_ctx, { params }) => {
        const post = await posts().getById(params.id);
        if (!post) {
          return json(404, {
            error: 'not_found',
            message: `Post ${params.id} not found`,
          });
        }
        return json(200, PostSchema.parse(post));
      },
    }),
    defineRoute({
      method: 'PUT',
      pattern: '/admin/posts/:id',
      auth: 'admin',
      metric: 'UpdatePost',
      params: IdParams,
      body: UpdatePostRequestSchema,
      handler: async (_ctx, { params, body }) => {
        const post = await posts().update(params.id, body);
        return json(200, PostSchema.parse(post));
      },
    }),
    defineRoute({
      method: 'DELETE',
      pattern: '/admin/posts/:id',
      auth: 'admin',
      metric: 'DeletePost',
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: async (_ctx, { params, body }) => {
        const post = await posts().softDelete(params.id, body.version);
        return json(200, PostSchema.parse(post));
      },
    }),
    defineRoute({
      method: 'POST',
      pattern: '/admin/posts/:id/publish',
      auth: 'admin',
      metric: 'PublishPost',
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: async (_ctx, { params, body }) => {
        const post = await posts().publish(params.id, {
          version: body.version,
        });
        return json(200, PostSchema.parse(post));
      },
    }),
    defineRoute({
      method: 'POST',
      pattern: '/admin/posts/:id/unpublish',
      auth: 'admin',
      metric: 'UnpublishPost',
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: async (_ctx, { params, body }) => {
        const post = await posts().unpublish(params.id, body.version);
        return json(200, PostSchema.parse(post));
      },
    }),
    defineRoute({
      method: 'POST',
      pattern: '/admin/posts/:id/discard',
      auth: 'admin',
      metric: 'DiscardPost',
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: async (_ctx, { params, body }) => {
        const post = await posts().discard(params.id, body.version);
        return json(200, PostSchema.parse(post));
      },
    }),
  ];
}
