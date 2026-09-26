import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import {
  AdminMeResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
} from './schemas.js';

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.register('HealthResponse', HealthResponseSchema);
  registry.register('AdminMeResponse', AdminMeResponseSchema);
  registry.register('ErrorResponse', ErrorResponseSchema);

  registry.registerPath({
    method: 'get',
    path: '/api/health',
    summary: 'Health check',
    tags: ['Public'],
    responses: {
      200: {
        description: 'Service is healthy',
        content: {
          'application/json': { schema: HealthResponseSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/admin/me',
    summary: 'Current authenticated admin user',
    tags: ['Admin'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Authenticated user claims',
        content: {
          'application/json': { schema: AdminMeResponseSchema },
        },
      },
      401: {
        description: 'Missing or invalid JWT',
        content: {
          'application/json': { schema: ErrorResponseSchema },
        },
      },
    },
  });

  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Cognito ID token (Authorization: Bearer <token>)',
  });

  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'gagnechris API',
      version: '0.1.0',
      description:
        'HTTP API for the Blog CMS admin and notebook. Same-origin via CloudFront /api/*.',
    },
    servers: [
      { url: 'https://gagnechris.com', description: 'Production' },
      { url: 'https://staging.gagnechris.com', description: 'Staging preview' },
      { url: 'http://localhost:3000', description: 'Local API (optional)' },
    ],
  });
}
