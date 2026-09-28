import { HomeSchema, UpdateHomeRequestSchema } from '@gagnechris/shared';
import {
  createSingletonRouteHandler,
  createSingletonRoutes,
} from '../data/singleton-handlers.js';
import type { RouteDef } from '../router.js';
import { HomeRepository } from './repository.js';

const homeConfig = {
  basePath: '/admin/home',
  entitySchema: HomeSchema,
  updateSchema: UpdateHomeRequestSchema,
  createRepo: () => new HomeRepository(),
};

export const homeRoutes: RouteDef[] = createSingletonRoutes(homeConfig);

export const handleHomeRoute = createSingletonRouteHandler(homeConfig);
