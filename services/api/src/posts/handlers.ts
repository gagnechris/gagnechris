import {
  CreatePostRequestSchema,
  ExpectedVersionRequestSchema,
  ListPostsQuerySchema,
  POSTS_PAGE_SIZE,
  PostListResponseSchema,
  PostSchema,
  UpdatePostRequestSchema,
} from '@gagnechris/shared';
import * as z from 'zod';
import { BadRequestError } from '../data/errors.js';
import { json } from '../http.js';
import { ProjectsRepository } from '../projects/repository.js';
import { defineRoute, type RouteDef } from '../router.js';
import { PostsRepository } from './repository.js';

const IdParams = z.object({ id: z.string().min(1) });

type ProjectLookup = Pick<ProjectsRepository, 'getById'>;

/** Ids already on the post are not rechecked, so deleting a project never blocks saving a post tagged with it. */
async function assertKnownProjectIds(
  ids: readonly string[] | undefined,
  projects: () => ProjectLookup,
  existing: readonly string[] = [],
): Promise<void> {
  const unique = [...new Set(ids)].filter((id) => !existing.includes(id));
  if (!unique.length) return;
  const repo = projects();
  const found = await Promise.all(unique.map((id) => repo.getById(id)));
  const unknown = unique.filter((_, i) => !found[i]);
  if (unknown.length) {
    throw new BadRequestError(`Unknown project id: ${unknown.join(', ')}`, {
      projectIds: 'unknown_project',
    });
  }
}

export function createPostRoutes(
  repo?: PostsRepository,
  projectsRepo?: ProjectLookup,
): RouteDef[] {
  const posts = () => repo ?? new PostsRepository();
  const projects = () => projectsRepo ?? new ProjectsRepository();
  return [
    defineRoute({
      method: 'GET',
      pattern: '/admin/posts',
      auth: 'site-admin',
      metric: 'ListPosts',
      query: ListPostsQuerySchema,
      handler: async (_ctx, { query }) => {
        const page = await posts().list(query.status, {
          cursor: query.cursor,
          limit: query.limit ?? POSTS_PAGE_SIZE,
        });
        return json(200, PostListResponseSchema.parse(page));
      },
    }),
    defineRoute({
      method: 'POST',
      pattern: '/admin/posts',
      auth: 'site-admin',
      metric: 'CreatePost',
      body: CreatePostRequestSchema,
      handler: async (_ctx, { body }) => {
        await assertKnownProjectIds(body.projectIds, projects);
        const post = await posts().create(body);
        return json(201, PostSchema.parse(post));
      },
    }),
    defineRoute({
      method: 'GET',
      pattern: '/admin/posts/:id',
      auth: 'site-admin',
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
      auth: 'site-admin',
      metric: 'UpdatePost',
      params: IdParams,
      body: UpdatePostRequestSchema,
      handler: async (_ctx, { params, body }) => {
        if (body.projectIds?.length) {
          const current = await posts().getById(params.id);
          await assertKnownProjectIds(
            body.projectIds,
            projects,
            current?.projectIds,
          );
        }
        const post = await posts().update(params.id, body);
        return json(200, PostSchema.parse(post));
      },
    }),
    defineRoute({
      method: 'DELETE',
      pattern: '/admin/posts/:id',
      auth: 'site-admin',
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
      auth: 'site-admin',
      metric: 'PublishPost',
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: async (_ctx, { params, body }) => {
        const post = await posts().publish(params.id, body.version);
        return json(200, PostSchema.parse(post));
      },
    }),
    defineRoute({
      method: 'POST',
      pattern: '/admin/posts/:id/unpublish',
      auth: 'site-admin',
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
      auth: 'site-admin',
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
