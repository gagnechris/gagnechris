import { z } from 'zod';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import {
  AdminMeResponseSchema,
  ContactRequestSchema,
  ContactResponseSchema,
  CreatePostRequestSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  MediaUploadUrlRequestSchema,
  MediaUploadUrlResponseSchema,
  PostListResponseSchema,
  PostSchema,
  PostStatusSchema,
  ResumeDownloadNotifyRequestSchema,
  ResumeDownloadNotifyResponseSchema,
  ResumeSchema,
  UpdatePostRequestSchema,
  UpdateResumeRequestSchema,
} from './schemas.js';

const PostIdParamsSchema = z.object({
  id: z.string().min(1).openapi({ description: 'Post id (ULID)' }),
});

const ListPostsQuerySchema = z.object({
  status: PostStatusSchema.optional().openapi({
    description: 'Filter by status (omit to list draft + published)',
  }),
});

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.register('HealthResponse', HealthResponseSchema);
  registry.register('AdminMeResponse', AdminMeResponseSchema);
  registry.register('ErrorResponse', ErrorResponseSchema);
  registry.register('Post', PostSchema);
  registry.register('PostListResponse', PostListResponseSchema);
  registry.register('CreatePostRequest', CreatePostRequestSchema);
  registry.register('UpdatePostRequest', UpdatePostRequestSchema);
  registry.register('MediaUploadUrlRequest', MediaUploadUrlRequestSchema);
  registry.register('MediaUploadUrlResponse', MediaUploadUrlResponseSchema);
  registry.register('ContactRequest', ContactRequestSchema);
  registry.register('ContactResponse', ContactResponseSchema);
  registry.register('Resume', ResumeSchema);
  registry.register('UpdateResumeRequest', UpdateResumeRequestSchema);
  registry.register(
    'ResumeDownloadNotifyRequest',
    ResumeDownloadNotifyRequestSchema,
  );
  registry.register(
    'ResumeDownloadNotifyResponse',
    ResumeDownloadNotifyResponseSchema,
  );

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

  registry.registerPath({
    method: 'get',
    path: '/api/admin/posts',
    summary: 'List posts (Blog CMS)',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { query: ListPostsQuerySchema },
    responses: {
      200: {
        description: 'Post list',
        content: {
          'application/json': { schema: PostListResponseSchema },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': { schema: ErrorResponseSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/admin/posts/{id}',
    summary: 'Get post by id',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema },
    responses: {
      200: {
        description: 'Post',
        content: { 'application/json': { schema: PostSchema } },
      },
      404: {
        description: 'Not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/posts',
    summary: 'Create draft post',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': { schema: CreatePostRequestSchema },
        },
      },
    },
    responses: {
      201: {
        description: 'Created',
        content: { 'application/json': { schema: PostSchema } },
      },
      409: {
        description: 'Slug conflict',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/admin/posts/{id}',
    summary: 'Update post (optimistic concurrency via version)',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: {
      params: PostIdParamsSchema,
      body: {
        content: {
          'application/json': { schema: UpdatePostRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated',
        content: { 'application/json': { schema: PostSchema } },
      },
      409: {
        description: 'Version conflict or slug taken',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      404: {
        description: 'Not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/posts/{id}/publish',
    summary: 'Publish post (stream event for publisher)',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema },
    responses: {
      200: {
        description: 'Published',
        content: { 'application/json': { schema: PostSchema } },
      },
      404: {
        description: 'Not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/posts/{id}/unpublish',
    summary: 'Unpublish post',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema },
    responses: {
      200: {
        description: 'Unpublished (draft)',
        content: { 'application/json': { schema: PostSchema } },
      },
      404: {
        description: 'Not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/admin/posts/{id}',
    summary: 'Soft-delete post',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema },
    responses: {
      200: {
        description: 'Soft-deleted',
        content: { 'application/json': { schema: PostSchema } },
      },
      404: {
        description: 'Not found',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/admin/resume',
    summary: 'Get the singleton resume (seeded on first read)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Resume',
        content: { 'application/json': { schema: ResumeSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/admin/resume',
    summary: 'Update resume (optimistic concurrency via version)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': { schema: UpdateResumeRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated',
        content: { 'application/json': { schema: ResumeSchema } },
      },
      400: {
        description: 'Invalid request body',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
      409: {
        description: 'Version conflict',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/resume/publish',
    summary: 'Publish resume (stream event for publisher)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Published',
        content: { 'application/json': { schema: ResumeSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/resume/unpublish',
    summary: 'Unpublish resume (live HTML is left in place)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Unpublished (draft)',
        content: { 'application/json': { schema: ResumeSchema } },
      },
      401: {
        description: 'Unauthorized',
        content: { 'application/json': { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/media/upload-url',
    summary: 'Presigned PUT URL for an image under /media',
    tags: ['Media'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': { schema: MediaUploadUrlRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Upload URL and public path',
        content: {
          'application/json': { schema: MediaUploadUrlResponseSchema },
        },
      },
      400: {
        description: 'Invalid content type, size, or body',
        content: {
          'application/json': { schema: ErrorResponseSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/contact',
    summary: 'Public contact form (SES email to site owner)',
    tags: ['Public'],
    request: {
      body: {
        content: {
          'application/json': { schema: ContactRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Accepted',
        content: {
          'application/json': { schema: ContactResponseSchema },
        },
      },
      400: {
        description: 'Validation error',
        content: {
          'application/json': { schema: ErrorResponseSchema },
        },
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/resume/download',
    summary: 'Anonymous resume-download notify (no PII)',
    tags: ['Public'],
    request: {
      body: {
        content: {
          'application/json': { schema: ResumeDownloadNotifyRequestSchema },
        },
      },
    },
    responses: {
      200: {
        description: 'Accepted',
        content: {
          'application/json': { schema: ResumeDownloadNotifyResponseSchema },
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
      version: '0.2.0',
      description:
        'HTTP API for Blog CMS and Notebook admin. Same-origin via CloudFront /api/*. Shared DynamoDB single-table (docs/data-model.md).',
    },
    servers: [
      { url: 'https://gagnechris.com', description: 'Production' },
      { url: 'http://localhost:3000', description: 'Local API (optional)' },
    ],
  });
}
