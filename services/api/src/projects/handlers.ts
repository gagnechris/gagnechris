import {
  CreateProjectRequestSchema,
  ListProjectsQuerySchema,
  ProjectListResponseSchema,
  ProjectSchema,
  UlidSchema,
  UpdateProjectRequestSchema,
} from '@gagnechris/shared';
import * as z from 'zod';
import { siteAdminVersionedRoute } from '../data/versioned-route.js';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { ProjectsRepository } from './repository.js';

const IdParams = z.object({ id: UlidSchema });

export function createProjectRoutes(repo?: ProjectsRepository): RouteDef[] {
  const projects = () => repo ?? new ProjectsRepository();
  return [
    defineRoute({
      method: 'GET',
      pattern: '/admin/projects',
      auth: 'site-admin',
      metric: 'ListProjects',
      query: ListProjectsQuerySchema,
      handler: async (_ctx, { query }) =>
        json(
          200,
          ProjectListResponseSchema.parse(await projects().list(query.status)),
        ),
    }),
    defineRoute({
      method: 'POST',
      pattern: '/admin/projects',
      auth: 'site-admin',
      metric: 'CreateProject',
      body: CreateProjectRequestSchema,
      handler: async (_ctx, { body }) =>
        json(201, ProjectSchema.parse(await projects().create(body))),
    }),
    defineRoute({
      method: 'GET',
      pattern: '/admin/projects/:id',
      auth: 'site-admin',
      metric: 'GetProject',
      params: IdParams,
      handler: async (_ctx, { params }) =>
        json(
          200,
          ProjectSchema.parse(await projects().getByIdOrThrow(params.id)),
        ),
    }),
    siteAdminVersionedRoute({
      method: 'PUT',
      pattern: '/admin/projects/:id',
      metric: 'UpdateProject',
      params: IdParams,
      body: UpdateProjectRequestSchema,
      entity: ProjectSchema,
      mutate: ({ params, body }) => projects().update(params.id, body),
    }),
    siteAdminVersionedRoute({
      method: 'DELETE',
      pattern: '/admin/projects/:id',
      metric: 'DeleteProject',
      params: IdParams,
      entity: ProjectSchema,
      mutate: ({ params, body }) =>
        projects().softDelete(params.id, body.version),
    }),
    siteAdminVersionedRoute({
      method: 'POST',
      pattern: '/admin/projects/:id/publish',
      metric: 'PublishProject',
      params: IdParams,
      entity: ProjectSchema,
      mutate: ({ params, body }) => projects().publish(params.id, body.version),
    }),
    siteAdminVersionedRoute({
      method: 'POST',
      pattern: '/admin/projects/:id/unpublish',
      metric: 'UnpublishProject',
      params: IdParams,
      entity: ProjectSchema,
      mutate: ({ params, body }) =>
        projects().unpublish(params.id, body.version),
    }),
    siteAdminVersionedRoute({
      method: 'POST',
      pattern: '/admin/projects/:id/discard',
      metric: 'DiscardProject',
      params: IdParams,
      entity: ProjectSchema,
      mutate: ({ params, body }) => projects().discard(params.id, body.version),
    }),
  ];
}
