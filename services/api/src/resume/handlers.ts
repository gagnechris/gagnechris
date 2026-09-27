import { ResumeSchema, UpdateResumeRequestSchema } from '@gagnechris/shared';
import { createSingletonRouteHandler } from '../data/singleton-handlers.js';
import { ResumeRepository } from './repository.js';

export const handleResumeRoute = createSingletonRouteHandler({
  basePath: '/admin/resume',
  entitySchema: ResumeSchema,
  updateSchema: UpdateResumeRequestSchema,
  createRepo: () => new ResumeRepository(),
});
