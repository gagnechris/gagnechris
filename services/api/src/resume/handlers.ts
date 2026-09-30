import { ResumeSchema, UpdateResumeRequestSchema } from '@gagnechris/shared';
import { createSingletonRoutes } from '../data/singleton-handlers.js';
import type { RouteDef } from '../router.js';
import { ResumeRepository } from './repository.js';

const resumeConfig = {
  basePath: '/admin/resume',
  entitySchema: ResumeSchema,
  updateSchema: UpdateResumeRequestSchema,
  createRepo: () => new ResumeRepository(),
};

export function createResumeRoutes(
  repo?: ReturnType<typeof resumeConfig.createRepo>,
): RouteDef[] {
  return createSingletonRoutes(resumeConfig, repo);
}

export const resumeRoutes: RouteDef[] = createResumeRoutes();
