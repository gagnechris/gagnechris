import { HomeSchema, UpdateHomeRequestSchema } from '@gagnechris/shared';
import { createSingletonRouteHandler } from '../data/singleton-handlers.js';
import { HomeRepository } from './repository.js';

export const handleHomeRoute = createSingletonRouteHandler({
  basePath: '/admin/home',
  entitySchema: HomeSchema,
  updateSchema: UpdateHomeRequestSchema,
  createRepo: () => new HomeRepository(),
});
