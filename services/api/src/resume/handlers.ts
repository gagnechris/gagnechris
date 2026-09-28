import { ResumeSchema, UpdateResumeRequestSchema } from '@gagnechris/shared';
import {
  createSingletonRouteHandler,
  createSingletonRoutes,
} from '../data/singleton-handlers.js';
import type { RouteDef } from '../router.js';
import { ResumeRepository } from './repository.js';

const resumeConfig = {
  basePath: '/admin/resume',
  entitySchema: ResumeSchema,
  updateSchema: UpdateResumeRequestSchema,
  createRepo: () => new ResumeRepository(),
};

export const resumeRoutes: RouteDef[] = createSingletonRoutes(resumeConfig);

export const handleResumeRoute = createSingletonRouteHandler(resumeConfig);
