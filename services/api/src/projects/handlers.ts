import {
  CreateProjectRequestSchema,
  ExpectedVersionRequestSchema,
  ListProjectsQuerySchema,
  ProjectListResponseSchema,
  ProjectSchema,
  UlidSchema,
  UpdateProjectRequestSchema,
} from '@gagnechris/shared';
import * as z from 'zod';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import { ProjectsRepository } from './repository.js';

const IdParams = z.object({ id: UlidSchema });

export function createProjectRoutes(repo?: ProjectsRepository): RouteDef[] {
  const projects = () => repo ?? new ProjectsRepository();
  const versioned = (
    method: 'POST' | 'DELETE',
    pattern: string,
    metric: string,
    run: (id: string, version: number) => Promise<unknown>,
  ) =>
    defineRoute({
      method,
      pattern,
      auth: 'site-admin',
      metric,
      params: IdParams,
      body: ExpectedVersionRequestSchema,
      handler: async (_ctx, { params, body }) =>
        json(200, ProjectSchema.parse(await run(params.id, body.version))),
    });

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
      handler: async (_ctx, { params }) => {
        const project = await projects().getById(params.id);
        if (!project) {
          return json(404, {
            error: 'not_found',
            message: `Project ${params.id} not found`,
          });
        }
        return json(200, ProjectSchema.parse(project));
      },
    }),
    defineRoute({
      method: 'PUT',
      pattern: '/admin/projects/:id',
      auth: 'site-admin',
      metric: 'UpdateProject',
      params: IdParams,
      body: UpdateProjectRequestSchema,
      handler: async (_ctx, { params, body }) =>
        json(
          200,
          ProjectSchema.parse(await projects().update(params.id, body)),
        ),
    }),
    versioned('DELETE', '/admin/projects/:id', 'DeleteProject', (id, v) =>
      projects().softDelete(id, v),
    ),
    versioned(
      'POST',
      '/admin/projects/:id/publish',
      'PublishProject',
      (id, v) => projects().publish(id, v),
    ),
    versioned(
      'POST',
      '/admin/projects/:id/unpublish',
      'UnpublishProject',
      (id, v) => projects().unpublish(id, v),
    ),
    versioned(
      'POST',
      '/admin/projects/:id/discard',
      'DiscardProject',
      (id, v) => projects().discard(id, v),
    ),
  ];
}
