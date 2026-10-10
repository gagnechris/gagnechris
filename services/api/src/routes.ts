import {
  AdminMeResponseSchema,
  API_SERVICE_NAME,
  HealthResponseSchema,
  type AdminMeResponse,
  type HealthResponse,
} from '@gagnechris/shared';
import { createContactRoutes } from './contact/handlers.js';
import { homeRoutes } from './home/handlers.js';
import { json } from './http.js';
import { mediaRoutes } from './media/handlers.js';
import { noteRoutes } from './notes/handlers.js';
import { createPostRoutes } from './posts/handlers.js';
import { createProjectRoutes } from './projects/handlers.js';
import { resumeRoutes } from './resume/handlers.js';
import { defineRoute, type RouteDef } from './router.js';
import { searchRoutes } from './search/handlers.js';
import { registerProductionSyncAdapters } from './sync/adapters.js';
import { syncRoutes } from './sync/handlers.js';
import { taskRoutes } from './tasks/handlers.js';
import { templateRoutes } from './templates/handlers.js';
import { createUserRoutes } from './users/handlers.js';

const health = defineRoute({
  method: 'GET',
  pattern: '/health',
  auth: 'public',
  metric: 'HealthCheck',
  handler: async () => {
    const body: HealthResponse = HealthResponseSchema.parse({
      status: 'ok',
      service: API_SERVICE_NAME,
    });
    return json(200, body);
  },
});

const adminMe = defineRoute({
  method: 'GET',
  pattern: '/admin/me',
  auth: 'site-admin',
  metric: 'AdminMe',
  handler: async (ctx) => {
    const claims = ctx.claims!;
    const body: AdminMeResponse = AdminMeResponseSchema.parse({
      sub: claims.sub,
      email: claims.email,
      username: claims['cognito:username'] ?? claims.username,
    });
    return json(200, body);
  },
});

// Explicit, not a repository import side effect.
registerProductionSyncAdapters();

export const routes: RouteDef[] = [
  health,
  adminMe,
  ...createContactRoutes(),
  ...createPostRoutes(),
  ...createProjectRoutes(),
  ...homeRoutes,
  ...resumeRoutes,
  ...mediaRoutes,
  ...noteRoutes,
  ...taskRoutes,
  ...templateRoutes,
  ...searchRoutes,
  ...syncRoutes,
  ...createUserRoutes(),
];
