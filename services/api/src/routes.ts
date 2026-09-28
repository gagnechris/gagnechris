/**
 * Canonical API route table (CHR-127).
 * Add a route: one entry here (or in a module export) + a handler.
 */
import {
  AdminMeResponseSchema,
  HealthResponseSchema,
  type AdminMeResponse,
  type HealthResponse,
} from '@gagnechris/shared';
import { createContactRoutes } from './contact/handlers.js';
import { homeRoutes } from './home/handlers.js';
import { json } from './http.js';
import { mediaRoutes } from './media/handlers.js';
import { createPostRoutes } from './posts/handlers.js';
import { resumeRoutes } from './resume/handlers.js';
import type { RouteDef } from './router.js';

const health: RouteDef = {
  method: 'GET',
  pattern: '/health',
  auth: 'public',
  metric: 'HealthCheck',
  handler: async () => {
    const body: HealthResponse = HealthResponseSchema.parse({
      status: 'ok',
      service: 'gagnechris-api',
    });
    return json(200, body);
  },
};

const adminMe: RouteDef = {
  method: 'GET',
  pattern: '/admin/me',
  auth: 'admin',
  metric: 'AdminMe',
  handler: async (ctx) => {
    const claims = ctx.claims;
    if (!claims?.sub) {
      return json(401, {
        error: 'unauthorized',
        message: 'Missing JWT claims',
      });
    }
    const body: AdminMeResponse = AdminMeResponseSchema.parse({
      sub: claims.sub,
      email: claims.email,
      username: claims['cognito:username'] ?? claims.username,
    });
    return json(200, body);
  },
};

/** All HTTP routes for the Lambda entrypoint. */
export const routes: RouteDef[] = [
  health,
  adminMe,
  ...createContactRoutes(),
  ...createPostRoutes(),
  ...homeRoutes,
  ...resumeRoutes,
  ...mediaRoutes,
];
