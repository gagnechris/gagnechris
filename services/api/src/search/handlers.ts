/**
 * Notebook search HTTP routes (CHR-46).
 */
import {
  NotebookSearchQuerySchema,
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
      method: 'GET',
      pattern: '/notebook/search',
      auth: 'admin',
      metric: 'NotebookSearch',
      query: NotebookSearchQuerySchema,
      handler: async (ctx, { query }) => {
        const result = await searchNotebook(ctx.userId!, query, deps);
        return json(200, NotebookSearchResponseSchema.parse(result));
      },
    }),
  ];
}

export const searchRoutes: RouteDef[] = createSearchRoutes();
