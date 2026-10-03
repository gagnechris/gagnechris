// POST with a JSON body so search terms never appear in a URL, and so never
// in CloudFront or API Gateway access logs.
import {
  NotebookSearchRequestSchema,
  NotebookSearchResponseSchema,
} from '@gagnechris/shared';
import { json } from '../http.js';
import { defineRoute, type RouteDef } from '../router.js';
import type { NotesRepository } from '../notes/repository.js';
import type { TasksRepository } from '../tasks/repository.js';
import { searchNotebook } from './service.js';

export function createSearchRoutes(deps?: {
  notes?: NotesRepository;
  tasks?: TasksRepository;
}): RouteDef[] {
  return [
    defineRoute({
      method: 'POST',
      pattern: '/notebook/search',
      auth: 'admin',
      metric: 'NotebookSearch',
      body: NotebookSearchRequestSchema,
      handler: async (ctx, { body }) => {
        const result = await searchNotebook(ctx.userId!, body, deps);
        return json(200, NotebookSearchResponseSchema.parse(result));
      },
    }),
  ];
}

export const searchRoutes: RouteDef[] = createSearchRoutes();
