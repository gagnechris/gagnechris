import {
  CreatePostRequestSchema,
  ListPostsQuerySchema,
  POSTS_PAGE_SIZE,
  PostListResponseSchema,
  PostSchema,
  UpdatePostRequestSchema,
} from '@gagnechris/shared';
import * as z from 'zod';
import { BadRequestError } from '../data/errors.js';
import { siteAdminVersionedRoute } from '../data/versioned-route.js';
import { json } from '../http.js';
import { ProjectsRepository } from '../projects/repository.js';
import { defineRoute, type RouteDef } from '../router.js';
import { PostsRepository } from './repository.js';

const IdParams = z.object({ id: z.string().min(1) });

type ProjectLookup = Pick<ProjectsRepository, 'existingIds'>;

/** Ids already on the post are not rechecked, so deleting a project never blocks saving a post tagged with it. */
async function assertKnownProjectIds(
  ids: readonly string[] | undefined,
  projects: () => ProjectLookup,
  existing: readonly string[] = [],
): Promise<void> {
  const unique = [...new Set(ids)].filter((id) => !existing.includes(id));
  if (!unique.length) return;
  const found = await projects().existingIds(unique);
  const unknown = unique.filter((id) => !found.has(id));
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
        const repo = posts();
        const [page, counts] = await Promise.all([
          repo.list(query.status, {
            cursor: query.cursor,
            limit: query.limit ?? POSTS_PAGE_SIZE,
            q: query.q,
          }),
          query.cursor ? undefined : repo.counts(),
        ]);
        return json(
          200,
          PostListResponseSchema.parse(counts ? { ...page, counts } : page),
        );
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
      handler: async (_ctx, { params }) =>
        json(200, PostSchema.parse(await posts().getByIdOrThrow(params.id))),
    }),
    siteAdminVersionedRoute({
      method: 'PUT',
      pattern: '/admin/posts/:id',
      metric: 'UpdatePost',
      params: IdParams,
      body: UpdatePostRequestSchema,
      entity: PostSchema,
      mutate: async ({ params, body }) => {
        if (body.projectIds?.length) {
          const current = await posts().getById(params.id);
          await assertKnownProjectIds(
            body.projectIds,
            projects,
            current?.projectIds,
          );
        }
        return posts().update(params.id, body);
      },
    }),
    siteAdminVersionedRoute({
      method: 'DELETE',
      pattern: '/admin/posts/:id',
      metric: 'DeletePost',
      params: IdParams,
      entity: PostSchema,
      mutate: ({ params, body }) => posts().softDelete(params.id, body.version),
    }),
    siteAdminVersionedRoute({
      method: 'POST',
      pattern: '/admin/posts/:id/publish',
      metric: 'PublishPost',
      params: IdParams,
      entity: PostSchema,
      mutate: ({ params, body }) => posts().publish(params.id, body.version),
    }),
    siteAdminVersionedRoute({
      method: 'POST',
      pattern: '/admin/posts/:id/unpublish',
      metric: 'UnpublishPost',
      params: IdParams,
      entity: PostSchema,
      mutate: ({ params, body }) => posts().unpublish(params.id, body.version),
    }),
    siteAdminVersionedRoute({
      method: 'POST',
      pattern: '/admin/posts/:id/discard',
      metric: 'DiscardPost',
      params: IdParams,
      entity: PostSchema,
      mutate: ({ params, body }) => posts().discard(params.id, body.version),
    }),
  ];
}
