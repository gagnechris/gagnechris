import { z } from 'zod';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import {
  AdminMeResponseSchema,
  ConflictErrorResponseSchema,
  ContactRequestSchema,
  ContactResponseSchema,
  CreatePostRequestSchema,
  ErrorResponseSchema,
  ExpectedVersionRequestSchema,
  HealthResponseSchema,
  HomeSchema,
  MediaUploadUrlRequestSchema,
  MediaUploadUrlResponseSchema,
  PostListResponseSchema,
  PostSchema,
  PostStatusSchema,
  ResumeDownloadNotifyRequestSchema,
  ResumeDownloadNotifyResponseSchema,
  ResumeSchema,
  UpdateHomeRequestSchema,
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
  cursor: z.string().min(1).optional().openapi({
    description: 'Opaque pagination cursor from a previous list response',
  }),
  limit: z.coerce.number().int().positive().max(100).optional().openapi({
    description: 'Page size (single-status queries only)',
  }),
});

const MediaObjectKeyParamsSchema = z.object({
  key: z.string().min(1).openapi({
    description: 'Object key under media/ (may include slashes)',
  }),
});

const versionBody = {
  body: {
    content: {
      'application/json': { schema: ExpectedVersionRequestSchema },
    },
  },
};

/** Shared OpenAPI response fragments (CHR-130). */
function jsonBody(schema: z.ZodType) {
  return { content: { 'application/json': { schema } } };
}

function ok(schema: z.ZodType, description: string) {
  return { description, ...jsonBody(schema) };
}

function err(description: string) {
  return { description, ...jsonBody(ErrorResponseSchema) };
}

function conflict(description = 'Conflict') {
  return { description, ...jsonBody(ConflictErrorResponseSchema) };
}

const r400 = err('Validation error (may include `fields`)');
const r401 = err('Unauthorized');
const r404 = err('Not found');
const r405 = err('Method not allowed on this path');
const r409 = conflict('Conflict (may include `currentVersion` / `current`)');
const r429 = err('Rate limited');
const r502 = err('Upstream failure (e.g. SES)');
const r503 = err('Service unavailable (throttling)');

const adminAuth = { 401: r401, 405: r405, 503: r503 };
const publicBase = { 405: r405, 503: r503 };

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.register('HealthResponse', HealthResponseSchema);
  registry.register('AdminMeResponse', AdminMeResponseSchema);
  registry.register('ErrorResponse', ErrorResponseSchema);
  registry.register('ConflictErrorResponse', ConflictErrorResponseSchema);
  registry.register('Post', PostSchema);
  registry.register('PostListResponse', PostListResponseSchema);
  registry.register('CreatePostRequest', CreatePostRequestSchema);
  registry.register('UpdatePostRequest', UpdatePostRequestSchema);
  registry.register('ExpectedVersionRequest', ExpectedVersionRequestSchema);
  registry.register('MediaUploadUrlRequest', MediaUploadUrlRequestSchema);
  registry.register('MediaUploadUrlResponse', MediaUploadUrlResponseSchema);
  registry.register('ContactRequest', ContactRequestSchema);
  registry.register('ContactResponse', ContactResponseSchema);
  registry.register('Home', HomeSchema);
  registry.register('UpdateHomeRequest', UpdateHomeRequestSchema);
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
      200: ok(HealthResponseSchema, 'Service is healthy'),
      ...publicBase,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/admin/me',
    summary: 'Current authenticated admin user',
    tags: ['Admin'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: ok(AdminMeResponseSchema, 'Authenticated user claims'),
      ...adminAuth,
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
      200: ok(PostListResponseSchema, 'Post list'),
      ...adminAuth,
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
      200: ok(PostSchema, 'Post'),
      404: r404,
      ...adminAuth,
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
      201: ok(PostSchema, 'Created'),
      400: r400,
      409: r409,
      ...adminAuth,
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
      200: ok(PostSchema, 'Updated'),
      400: r400,
      404: r404,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/posts/{id}/publish',
    summary: 'Publish post (copies draft to PUBLISHED snapshot; stream rebuild)',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema, ...versionBody },
    responses: {
      200: ok(PostSchema, 'Published'),
      400: r400,
      404: r404,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/posts/{id}/unpublish',
    summary: 'Unpublish post',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema, ...versionBody },
    responses: {
      200: ok(PostSchema, 'Unpublished (draft)'),
      400: r400,
      404: r404,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/posts/{id}/discard',
    summary: 'Discard draft edits and restore from the published snapshot',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema, ...versionBody },
    responses: {
      200: ok(PostSchema, 'Draft restored from published snapshot'),
      400: r400,
      404: r404,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/admin/posts/{id}',
    summary: 'Soft-delete post',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema, ...versionBody },
    responses: {
      200: ok(PostSchema, 'Soft-deleted'),
      400: r400,
      404: r404,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/admin/home',
    summary:
      'Get home draft (seeded as draft on first read; includes hasUnpublishedChanges)',
    tags: ['Home'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: ok(HomeSchema, 'Home'),
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/admin/home',
    summary: 'Update home content (optimistic concurrency via version)',
    tags: ['Home'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': { schema: UpdateHomeRequestSchema },
        },
      },
    },
    responses: {
      200: ok(HomeSchema, 'Updated'),
      400: r400,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/home/publish',
    summary: 'Publish home (copies draft to PUBLISHED snapshot; stream rebuild)',
    tags: ['Home'],
    security: [{ bearerAuth: [] }],
    request: versionBody,
    responses: {
      200: ok(HomeSchema, 'Published'),
      400: r400,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/home/unpublish',
    summary: 'Unpublish home (live index.html is left in place)',
    tags: ['Home'],
    security: [{ bearerAuth: [] }],
    request: versionBody,
    responses: {
      200: ok(HomeSchema, 'Unpublished (draft)'),
      400: r400,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/home/discard',
    summary: 'Discard draft edits and restore from the published snapshot',
    tags: ['Home'],
    security: [{ bearerAuth: [] }],
    request: versionBody,
    responses: {
      200: ok(HomeSchema, 'Draft restored from published snapshot'),
      400: r400,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/admin/resume',
    summary:
      'Get resume draft (seeded as draft on first read; includes hasUnpublishedChanges)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: ok(ResumeSchema, 'Resume'),
      ...adminAuth,
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
      200: ok(ResumeSchema, 'Updated'),
      400: r400,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/resume/publish',
    summary: 'Publish resume (copies draft to PUBLISHED snapshot; regenerates PDF)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    request: versionBody,
    responses: {
      200: ok(ResumeSchema, 'Published'),
      400: r400,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/resume/unpublish',
    summary: 'Unpublish resume (live HTML is left in place)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    request: versionBody,
    responses: {
      200: ok(ResumeSchema, 'Unpublished (draft)'),
      400: r400,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/resume/discard',
    summary: 'Discard draft edits and restore from the published snapshot',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    request: versionBody,
    responses: {
      200: ok(ResumeSchema, 'Draft restored from published snapshot'),
      400: r400,
      409: r409,
      ...adminAuth,
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
      200: ok(MediaUploadUrlResponseSchema, 'Upload URL and public path'),
      400: r400,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/admin/media/objects/{key}',
    summary:
      'Local-only media PUT (filesystem SITE_STORAGE). Production uses the S3 uploadUrl.',
    tags: ['Media'],
    security: [{ bearerAuth: [] }],
    request: { params: MediaObjectKeyParamsSchema },
    responses: {
      204: { description: 'Stored' },
      400: r400,
      404: err('Not available outside filesystem mode'),
      ...adminAuth,
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
      200: ok(ContactResponseSchema, 'Accepted'),
      400: r400,
      429: r429,
      502: r502,
      ...publicBase,
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
      200: ok(ResumeDownloadNotifyResponseSchema, 'Accepted'),
      400: r400,
      ...publicBase,
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
      version: '0.3.0',
      description:
        'HTTP API for Blog CMS and Notebook admin. Same-origin via CloudFront /api/*. Shared DynamoDB single-table (docs/data-model.md).',
    },
    servers: [
      { url: 'https://gagnechris.com', description: 'Production' },
      {
        url: 'http://localhost:8787',
        description: 'Local API (services/api/local/server.ts)',
      },
    ],
  });
}
