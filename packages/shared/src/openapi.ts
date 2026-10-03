import './openapi-extend.js';
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
  ListPostsQuerySchema,
  MediaUploadUrlRequestSchema,
  MediaUploadUrlResponseSchema,
  PostListResponseSchema,
  PostSchema,
  PostSeoSchema,
  PreconditionFailedErrorResponseSchema,
  ResumeContentSchema,
  ResumeDownloadNotifyRequestSchema,
  ResumeDownloadNotifyResponseSchema,
  ResumeEducationSchema,
  ResumeExperienceSchema,
  ResumeSchema,
  ULID_PATTERN,
  UlidSchema,
  UpdateHomeRequestSchema,
  UpdatePostRequestSchema,
  UpdateResumeRequestSchema,
  CalendarDateSchema,
  CreateNoteRequestSchema,
  CreateTaskRequestSchema,
  DailyNoteGetResponseSchema,
  EmptyDailyNoteSchema,
  FakeNoteEntitySchema,
  FakeNoteSyncChangeSchema,
  ListNotesQuerySchema,
  ListTasksQuerySchema,
  NotebookAreaSchema,
  NotebookSearchRequestSchema,
  NotebookSearchResponseSchema,
  NoteListResponseSchema,
  NoteSchema,
  NoteSyncChangeSchema,
  SyncChangeSchema,
  SyncChangesResponseSchema,
  SyncChangesQuerySchema,
  TaskListResponseSchema,
  TaskSchema,
  TaskSyncChangeSchema,
  UpdateNoteRequestSchema,
  UpdateTaskRequestSchema,
  UpsertDailyNoteRequestSchema,
} from './schemas.js';

const PostIdParamsSchema = z.object({
  id: UlidSchema.openapi({
    description: 'Post id (ULID)',
    type: 'string',
    pattern: ULID_PATTERN,
  }),
});

const MediaObjectKeyParamsSchema = z.object({
  key: z.string().min(1).openapi({
    description: 'Object key under media/ (may include slashes)',
  }),
});

const NoteIdParamsSchema = z.object({
  id: UlidSchema.openapi({
    description: 'Note id (ULID)',
    type: 'string',
    pattern: ULID_PATTERN,
  }),
});

const TaskIdParamsSchema = z.object({
  id: UlidSchema.openapi({
    description: 'Task id (ULID)',
    type: 'string',
    pattern: ULID_PATTERN,
  }),
});

const DailyNoteParamsSchema = z.object({
  area: NotebookAreaSchema,
  date: CalendarDateSchema,
});

/** Optional If-Match on versioned mutations (CHR-171). */
const IfMatchHeadersSchema = z.object({
  'if-match': z.string().optional().openapi({
    description:
      'Optimistic concurrency expectation: `"<version>"`, `W/"<version>"`, or `*`',
    example: '"3"',
  }),
});

const etagResponseHeaders = {
  ETag: {
    description: 'Strong entity version tag (quoted integer), e.g. `"3"`',
    schema: { type: 'string' as const, example: '"3"' },
  },
};

const versionBody = {
  headers: IfMatchHeadersSchema,
  body: {
    content: {
      'application/json': { schema: ExpectedVersionRequestSchema },
    },
  },
};

/** Shared OpenAPI response fragments (CHR-130 / CHR-171). */
function jsonBody(schema: z.ZodType) {
  return { content: { 'application/json': { schema } } };
}

function ok(schema: z.ZodType, description: string) {
  return { description, ...jsonBody(schema) };
}

function okWithEtag(schema: z.ZodType, description: string) {
  return {
    description,
    headers: etagResponseHeaders,
    ...jsonBody(schema),
  };
}

function err(description: string) {
  return { description, ...jsonBody(ErrorResponseSchema) };
}

function conflict(description = 'Conflict') {
  return { description, ...jsonBody(ConflictErrorResponseSchema) };
}

function preconditionFailed(
  description = 'Precondition failed (`If-Match` version mismatch)',
) {
  return {
    description,
    ...jsonBody(PreconditionFailedErrorResponseSchema),
  };
}

const r400 = err('Validation error (may include `fields`)');
const r401 = err('Unauthorized');
const r404 = err('Not found');
const r409 = conflict('Conflict (may include `currentVersion` / `current`)');
const r410 = err(
  'Gone — sync watermark older than tombstone horizon (`resync_required`)',
);
const r412 = preconditionFailed();
const r413 = err(
  'A field is over its size limit (`payload_too_large`, with `fields`)',
);
const r429 = err('Rate limited');
const r500 = err('Internal error');
const r502 = err('Upstream failure (e.g. SES)');
const r503 = err('Service unavailable (throttling)');

const notebookAuth = { 401: r401, 410: r410, 500: r500, 503: r503 };
const versionedAuth = { 401: r401, 412: r412, 500: r500, 503: r503 };

const adminAuth = { 401: r401, 500: r500, 503: r503 };
const publicBase = { 500: r500, 503: r503 };

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.register('HealthResponse', HealthResponseSchema);
  registry.register('AdminMeResponse', AdminMeResponseSchema);
  registry.register('ErrorResponse', ErrorResponseSchema);
  registry.register('ConflictErrorResponse', ConflictErrorResponseSchema);
  registry.register(
    'PreconditionFailedErrorResponse',
    PreconditionFailedErrorResponseSchema,
  );
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
  registry.register('ResumeContent', ResumeContentSchema);
  registry.register('ResumeEducation', ResumeEducationSchema);
  registry.register('ResumeExperience', ResumeExperienceSchema);
  registry.register('PostSeo', PostSeoSchema);
  registry.register('Note', NoteSchema);
  registry.register('NoteListResponse', NoteListResponseSchema);
  registry.register('CreateNoteRequest', CreateNoteRequestSchema);
  registry.register('UpdateNoteRequest', UpdateNoteRequestSchema);
  registry.register('ListNotesQuery', ListNotesQuerySchema);
  registry.register('EmptyDailyNote', EmptyDailyNoteSchema);
  registry.register('DailyNoteGetResponse', DailyNoteGetResponseSchema);
  registry.register('UpsertDailyNoteRequest', UpsertDailyNoteRequestSchema);
  registry.register('Task', TaskSchema);
  registry.register('TaskListResponse', TaskListResponseSchema);
  registry.register('CreateTaskRequest', CreateTaskRequestSchema);
  registry.register('UpdateTaskRequest', UpdateTaskRequestSchema);
  registry.register('ListTasksQuery', ListTasksQuerySchema);
  registry.register('NotebookSearchRequest', NotebookSearchRequestSchema);
  registry.register('NotebookSearchResponse', NotebookSearchResponseSchema);
  registry.register('FakeNoteEntity', FakeNoteEntitySchema);
  registry.register('FakeNoteSyncChange', FakeNoteSyncChangeSchema);
  registry.register('NoteSyncChange', NoteSyncChangeSchema);
  registry.register('TaskSyncChange', TaskSyncChangeSchema);
  registry.register('SyncChange', SyncChangeSchema);
  registry.register('SyncChangesResponse', SyncChangesResponseSchema);

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
      400: r400,
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
      200: okWithEtag(PostSchema, 'Post'),
      400: r400,
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
      201: okWithEtag(PostSchema, 'Created'),
      400: r400,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/admin/posts/{id}',
    summary: 'Update post (optimistic concurrency via version / If-Match)',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: {
      params: PostIdParamsSchema,
      headers: IfMatchHeadersSchema,
      body: {
        content: {
          'application/json': { schema: UpdatePostRequestSchema },
        },
      },
    },
    responses: {
      200: okWithEtag(PostSchema, 'Updated'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/posts/{id}/publish',
    summary:
      'Publish post (copies draft to PUBLISHED snapshot; stream rebuild)',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema, ...versionBody },
    responses: {
      200: okWithEtag(PostSchema, 'Published'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
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
      200: okWithEtag(PostSchema, 'Unpublished (draft)'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
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
      200: okWithEtag(PostSchema, 'Draft restored from published snapshot'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
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
      200: okWithEtag(PostSchema, 'Soft-deleted'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
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
      200: okWithEtag(HomeSchema, 'Home'),
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/admin/home',
    summary:
      'Update home content (optimistic concurrency via version / If-Match)',
    tags: ['Home'],
    security: [{ bearerAuth: [] }],
    request: {
      headers: IfMatchHeadersSchema,
      body: {
        content: {
          'application/json': { schema: UpdateHomeRequestSchema },
        },
      },
    },
    responses: {
      200: okWithEtag(HomeSchema, 'Updated'),
      400: r400,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/home/publish',
    summary:
      'Publish home (copies draft to PUBLISHED snapshot; stream rebuild)',
    tags: ['Home'],
    security: [{ bearerAuth: [] }],
    request: versionBody,
    responses: {
      200: okWithEtag(HomeSchema, 'Published'),
      400: r400,
      409: r409,
      ...versionedAuth,
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
      200: okWithEtag(HomeSchema, 'Unpublished (draft)'),
      400: r400,
      409: r409,
      ...versionedAuth,
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
      200: okWithEtag(HomeSchema, 'Draft restored from published snapshot'),
      400: r400,
      409: r409,
      ...versionedAuth,
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
      200: okWithEtag(ResumeSchema, 'Resume'),
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/admin/resume',
    summary: 'Update resume (optimistic concurrency via version / If-Match)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    request: {
      headers: IfMatchHeadersSchema,
      body: {
        content: {
          'application/json': { schema: UpdateResumeRequestSchema },
        },
      },
    },
    responses: {
      200: okWithEtag(ResumeSchema, 'Updated'),
      400: r400,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/resume/publish',
    summary:
      'Publish resume (copies draft to PUBLISHED snapshot; regenerates PDF)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    request: versionBody,
    responses: {
      200: okWithEtag(ResumeSchema, 'Published'),
      400: r400,
      409: r409,
      ...versionedAuth,
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
      200: okWithEtag(ResumeSchema, 'Unpublished (draft)'),
      400: r400,
      409: r409,
      ...versionedAuth,
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
      200: okWithEtag(ResumeSchema, 'Draft restored from published snapshot'),
      400: r400,
      409: r409,
      ...versionedAuth,
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
    method: 'get',
    path: '/api/notebook/notes',
    summary: 'List notes for the authenticated user',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: { query: ListNotesQuerySchema },
    responses: {
      200: ok(NoteListResponseSchema, 'Note page'),
      400: r400,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/notebook/notes',
    summary: 'Create a note (client ULID; idempotent)',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': { schema: CreateNoteRequestSchema },
        },
      },
    },
    responses: {
      201: okWithEtag(NoteSchema, 'Created'),
      400: r400,
      413: r413,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/notebook/notes/daily/{area}/{date}',
    summary: 'Get daily note or empty draft placeholder',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: { params: DailyNoteParamsSchema },
    responses: {
      200: okWithEtag(
        DailyNoteGetResponseSchema,
        'Daily note (with ETag) or empty draft (no ETag)',
      ),
      400: r400,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/notebook/notes/daily/{area}/{date}',
    summary: 'Create or update the daily note for an area/date',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      params: DailyNoteParamsSchema,
      headers: IfMatchHeadersSchema,
      body: {
        content: {
          'application/json': { schema: UpsertDailyNoteRequestSchema },
        },
      },
    },
    responses: {
      200: okWithEtag(NoteSchema, 'Upserted daily note'),
      400: r400,
      413: r413,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/notebook/notes/{id}',
    summary: 'Get a note by id',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: { params: NoteIdParamsSchema },
    responses: {
      200: okWithEtag(NoteSchema, 'Note'),
      400: r400,
      404: r404,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/notebook/notes/{id}',
    summary: 'Update a note',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      params: NoteIdParamsSchema,
      headers: IfMatchHeadersSchema,
      body: {
        content: {
          'application/json': { schema: UpdateNoteRequestSchema },
        },
      },
    },
    responses: {
      200: okWithEtag(NoteSchema, 'Updated'),
      400: r400,
      413: r413,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/notebook/notes/{id}',
    summary: 'Soft-delete a note',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      params: NoteIdParamsSchema,
      ...versionBody,
    },
    responses: {
      200: okWithEtag(NoteSchema, 'Soft-deleted'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/notebook/tasks',
    summary:
      'List tasks for the authenticated user (server-sorted: overdue, due date, priority)',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: { query: ListTasksQuerySchema },
    responses: {
      200: ok(TaskListResponseSchema, 'Task page'),
      400: r400,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/notebook/tasks',
    summary: 'Create a task (client ULID; idempotent)',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': { schema: CreateTaskRequestSchema },
        },
      },
    },
    responses: {
      201: okWithEtag(TaskSchema, 'Created'),
      400: r400,
      413: r413,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/notebook/tasks/{id}/complete',
    summary: 'Mark a task done (sets completedAt)',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      params: TaskIdParamsSchema,
      ...versionBody,
    },
    responses: {
      200: okWithEtag(TaskSchema, 'Completed'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/notebook/tasks/{id}/reopen',
    summary: 'Reopen a task (status todo; clears completedAt)',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      params: TaskIdParamsSchema,
      ...versionBody,
    },
    responses: {
      200: okWithEtag(TaskSchema, 'Reopened'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/notebook/tasks/{id}',
    summary: 'Get a task by id',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: { params: TaskIdParamsSchema },
    responses: {
      200: okWithEtag(TaskSchema, 'Task'),
      400: r400,
      404: r404,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/notebook/tasks/{id}',
    summary: 'Update a task',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      params: TaskIdParamsSchema,
      headers: IfMatchHeadersSchema,
      body: {
        content: {
          'application/json': { schema: UpdateTaskRequestSchema },
        },
      },
    },
    responses: {
      200: okWithEtag(TaskSchema, 'Updated'),
      400: r400,
      413: r413,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/notebook/tasks/{id}',
    summary: 'Soft-delete a task',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      params: TaskIdParamsSchema,
      ...versionBody,
    },
    responses: {
      200: okWithEtag(TaskSchema, 'Soft-deleted'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/notebook/search',
    summary: 'Search notes and tasks for the authenticated user',
    description:
      'Search terms travel in the JSON body, never the URL, so they stay out of CloudFront and API Gateway access logs (CHR-196).',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': { schema: NotebookSearchRequestSchema },
        },
      },
    },
    responses: {
      200: ok(NotebookSearchResponseSchema, 'Grouped search hits'),
      400: r400,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/notebook/sync/changes',
    summary: 'Changes since watermark for the authenticated user',
    tags: ['Notebook'],
    security: [{ bearerAuth: [] }],
    request: { query: SyncChangesQuerySchema },
    responses: {
      200: ok(SyncChangesResponseSchema, 'Sync change feed page'),
      400: r400,
      ...notebookAuth,
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
  return requireRequestBodies(
    generator.generateDocument({
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
    }),
  );
}

type OpenApiDocument = ReturnType<OpenApiGeneratorV3['generateDocument']>;

/**
 * Mark every declared JSON body `required` (CHR-186). Otherwise
 * openapi-typescript makes `body` optional and a mutation called without its
 * body (e.g. a delete with no expected version) still typechecks. Notebook
 * routes also accept `If-Match` alone, but typed clients send the body.
 */
function requireRequestBodies(doc: OpenApiDocument): OpenApiDocument {
  for (const pathItem of Object.values(doc.paths ?? {})) {
    for (const op of Object.values(pathItem)) {
      if (
        op &&
        typeof op === 'object' &&
        'requestBody' in op &&
        op.requestBody &&
        !('$ref' in op.requestBody)
      ) {
        op.requestBody.required = true;
      }
    }
  }
  return doc;
}
