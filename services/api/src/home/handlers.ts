import { HomeSchema, UpdateHomeRequestSchema } from '@gagnechris/shared';
import { createSingletonRoutes } from '../data/singleton-handlers.js';
import type { RouteDef } from '../router.js';
import { HomeRepository } from './repository.js';

const homeConfig = {
  basePath: '/admin/home',
  entitySchema: HomeSchema,
  updateSchema: UpdateHomeRequestSchema,
  createRepo: () => new HomeRepository(),
};

export function createHomeRoutes(
  repo?: ReturnType<typeof homeConfig.createRepo>,
): RouteDef[] {
  return createSingletonRoutes(homeConfig, repo);
}

export const homeRoutes: RouteDef[] = createHomeRoutes();
