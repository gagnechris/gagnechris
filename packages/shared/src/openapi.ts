import './openapi-extend.js';
import * as z from 'zod';
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
  CreateProjectRequestSchema,
  ErrorResponseSchema,
  ExpectedVersionRequestSchema,
  HealthResponseSchema,
  HomeSchema,
  ListPostsQuerySchema,
  ListProjectsQuerySchema,
  MediaUploadUrlRequestSchema,
  MediaUploadUrlResponseSchema,
  PostListResponseSchema,
  PostSummarySchema,
  PostSchema,
  PostSeoSchema,
  PreconditionFailedErrorResponseSchema,
  ProjectLinkSchema,
  ProjectListResponseSchema,
  ProjectSchema,
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
  UpdateProjectRequestSchema,
  UpdateResumeRequestSchema,
  CalendarDateSchema,
  CreateNoteRequestSchema,
  CreateTaskRequestSchema,
  DailyNoteGetResponseSchema,
  EmptyDailyNoteSchema,
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
  UpgradeRequiredErrorResponseSchema,
  ClientVersionHeadersSchema,
  CLIENT_VERSION_HEADER,
  UpdateNoteRequestSchema,
  UpdateTaskRequestSchema,
  OpenDailyNoteRequestSchema,
  UpsertDailyNoteRequestSchema,
} from './schemas.js';
import {
  InviteUserRequestSchema,
  InviteUserResponseSchema,
  ManagedUserIdSchema,
  SetUserAccessRequestSchema,
  UserConflictResponseSchema,
  UserListResponseSchema,
  UserResponseSchema,
} from './users.js';

const PostIdParamsSchema = z.object({
  id: UlidSchema.openapi({
    description: 'Post id (ULID)',
    type: 'string',
    pattern: ULID_PATTERN,
  }),
});

const ProjectIdParamsSchema = z.object({
  id: UlidSchema.openapi({
    description: 'Project id (ULID)',
    type: 'string',
    pattern: ULID_PATTERN,
  }),
});

const MediaObjectKeyParamsSchema = z.object({
  key: z.string().min(1).openapi({
    description: 'Object key under media/ (may include slashes)',
  }),
});

const DailyNoteParamsSchema = z.object({
  area: NotebookAreaSchema,
  date: CalendarDateSchema,
});

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

const versionOnlyBody = {
  body: {
    content: {
      'application/json': { schema: ExpectedVersionRequestSchema },
    },
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

type NotebookEntityPathsConfig = {
  path: string;
  noun: string;
  listSummary?: string;
  entity: z.ZodType;
  listQuery: z.ZodObject;
  listResponse: z.ZodType;
  createRequest: z.ZodType;
  updateRequest: z.ZodType;
  /**
   * Entity-specific paths, registered between the collection and `{id}`
   * paths because registration order is the order in openapi.json.
   */
  extraPaths?: (idParams: z.ZodObject) => void;
};

/** List / create / get / update / soft-delete paths of a versioned Notebook entity. */
function registerNotebookEntityPaths(
  registry: OpenAPIRegistry,
  config: NotebookEntityPathsConfig,
) {
  const { path, noun, entity } = config;
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  const idParams = z.object({
    id: UlidSchema.openapi({
      description: `${Noun} id (ULID)`,
      type: 'string',
      pattern: ULID_PATTERN,
    }),
  });
  const base = { tags: ['Notebook'], security: [{ bearerAuth: [] }] };

  registry.registerPath({
    method: 'get',
    path,
    summary: config.listSummary ?? `List ${noun}s for the authenticated user`,
    ...base,
    request: { query: config.listQuery },
    responses: {
      200: ok(config.listResponse, `${Noun} page`),
      400: r400,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path,
    summary: `Create a ${noun} (client ULID; idempotent)`,
    ...base,
    request: { body: jsonBody(config.createRequest) },
    responses: {
      201: okWithEtag(entity, 'Created'),
      400: r400,
      413: r413,
      409: r409,
      ...adminAuth,
    },
  });

  config.extraPaths?.(idParams);

  registry.registerPath({
    method: 'get',
    path: `${path}/{id}`,
    summary: `Get a ${noun} by id`,
    ...base,
    request: { params: idParams },
    responses: {
      200: okWithEtag(entity, Noun),
      400: r400,
      404: r404,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: `${path}/{id}`,
    summary: `Update a ${noun}`,
    ...base,
    request: {
      params: idParams,
      headers: IfMatchHeadersSchema,
      body: jsonBody(config.updateRequest),
    },
    responses: {
      200: okWithEtag(entity, 'Updated'),
      400: r400,
      413: r413,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });

  registry.registerPath({
    method: 'delete',
    path: `${path}/{id}`,
    summary: `Soft-delete a ${noun}`,
    ...base,
    request: { params: idParams, ...versionBody },
    responses: {
      200: okWithEtag(entity, 'Soft-deleted'),
      400: r400,
      404: r404,
      409: r409,
      ...versionedAuth,
    },
  });
}

function registerUserPaths(registry: OpenAPIRegistry) {
  const base = { tags: ['Users'], security: [{ bearerAuth: [] }] };
  const params = z.object({ id: ManagedUserIdSchema });
  const userConflict = {
    description:
      'Not allowed: your own account (`self_change`), the last Full Admin (`last_full_admin`), an existing email (`user_exists`), a removed user (`user_removed`), not removed (`not_removed`) or already signed in (`not_invited`)',
    ...jsonBody(UserConflictResponseSchema),
  };
  const recentSignIn =
    'Needs a sign-in within the last 5 minutes (ID token `auth_time`); otherwise 403 with `{ "error": "reauth_required" }`.';
  const mutation = {
    200: ok(UserResponseSchema, 'The user after the change'),
    400: r400,
    404: r404,
    409: userConflict,
    ...adminAuth,
  };

  registry.registerPath({
    method: 'get',
    path: '/api/admin/users',
    summary: 'List users with their access level and status',
    ...base,
    responses: { 200: ok(UserListResponseSchema, 'Users'), ...adminAuth },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/users',
    summary:
      'Invite a user by email; an email that belonged to a removed user restores that user',
    ...base,
    request: { body: jsonBody(InviteUserRequestSchema) },
    responses: {
      200: ok(InviteUserResponseSchema, 'Invited or restored user'),
      400: r400,
      409: userConflict,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/admin/users/{id}/access',
    summary: 'Set access level; lowering it also signs the user out everywhere',
    description: recentSignIn,
    ...base,
    request: { params, body: jsonBody(SetUserAccessRequestSchema) },
    responses: mutation,
  });

  for (const [action, summary] of [
    ['disable', 'Disable sign-in; access level unchanged'],
    ['enable', 'Enable sign-in'],
    [
      'sign-out',
      'Sign the user out everywhere; their open sessions end within the hour',
    ],
    [
      'remove',
      'Remove access: drop all groups and disable sign-in. The account and its Notebook are kept',
    ],
    ['resend-invite', 'Resend the invite email with a new temporary password'],
  ] as const) {
    registry.registerPath({
      method: 'post',
      path: `/api/admin/users/{id}/${action}`,
      summary,
      ...(action === 'resend-invite' ? {} : { description: recentSignIn }),
      ...base,
      request: { params },
      responses: mutation,
    });
  }

  registry.registerPath({
    method: 'post',
    path: '/api/admin/users/{id}/restore',
    summary:
      'Restore a removed user at the given level, or their previous level',
    description: recentSignIn,
    ...base,
    request: {
      params,
      body: jsonBody(SetUserAccessRequestSchema.partial()),
    },
    responses: mutation,
  });
}

function registerProjectPaths(registry: OpenAPIRegistry) {
  const base = { tags: ['Projects'], security: [{ bearerAuth: [] }] };
  const mutation = { 400: r400, 404: r404, 409: r409, ...adminAuth };

  registry.registerPath({
    method: 'get',
    path: '/api/admin/projects',
    summary: 'List projects (published first, then drafts; by order)',
    ...base,
    request: { query: ListProjectsQuerySchema },
    responses: {
      200: ok(ProjectListResponseSchema, 'Projects'),
      400: r400,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/projects',
    summary: 'Create draft project',
    ...base,
    request: { body: jsonBody(CreateProjectRequestSchema) },
    responses: {
      201: ok(ProjectSchema, 'Created'),
      400: r400,
      409: r409,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/admin/projects/{id}',
    summary: 'Get project by id',
    ...base,
    request: { params: ProjectIdParamsSchema },
    responses: {
      200: ok(ProjectSchema, 'Project'),
      400: r400,
      404: r404,
      ...adminAuth,
    },
  });

  registry.registerPath({
    method: 'put',
    path: '/api/admin/projects/{id}',
    summary: 'Update project draft (optimistic concurrency via version)',
    ...base,
    request: {
      params: ProjectIdParamsSchema,
      body: jsonBody(UpdateProjectRequestSchema),
    },
    responses: { 200: ok(ProjectSchema, 'Updated'), ...mutation },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/admin/projects/{id}/publish',
    summary:
      'Publish project (copies draft to PUBLISHED snapshot; stream rebuild)',
    ...base,
    request: { params: ProjectIdParamsSchema, ...versionOnlyBody },
    responses: {
      200: ok(ProjectSchema, 'Published'),
      ...mutation,
      400: {
        description:
          'Validation error. `fields.previewImage` is `required_with_demo` when the draft has a `demo` but no `previewImage`.',
        content: {
          'application/json': {
            schema: ErrorResponseSchema,
            example: {
              error: 'bad_request',
              message:
                'A project with a demo needs a preview image before it is published',
              fields: { previewImage: 'required_with_demo' },
            },
          },
        },
      },
    },
  });

  for (const [action, summary, description] of [
    ['unpublish', 'Unpublish project', 'Unpublished (draft)'],
    [
      'discard',
      'Discard draft edits and restore from the published snapshot',
      'Draft restored from published snapshot',
    ],
  ] as const) {
    registry.registerPath({
      method: 'post',
      path: `/api/admin/projects/{id}/${action}`,
      summary,
      ...base,
      request: { params: ProjectIdParamsSchema, ...versionOnlyBody },
      responses: { 200: ok(ProjectSchema, description), ...mutation },
    });
  }

  registry.registerPath({
    method: 'delete',
    path: '/api/admin/projects/{id}',
    summary: 'Soft-delete project (removes it from the live site)',
    ...base,
    request: { params: ProjectIdParamsSchema, ...versionOnlyBody },
    responses: { 200: ok(ProjectSchema, 'Soft-deleted'), ...mutation },
  });
}

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
  registry.register('PostSummary', PostSummarySchema);
  registry.register('PostListResponse', PostListResponseSchema);
  registry.register('CreatePostRequest', CreatePostRequestSchema);
  registry.register('UpdatePostRequest', UpdatePostRequestSchema);
  registry.register('Project', ProjectSchema);
  registry.register('ProjectLink', ProjectLinkSchema);
  registry.register('ProjectListResponse', ProjectListResponseSchema);
  registry.register('CreateProjectRequest', CreateProjectRequestSchema);
  registry.register('UpdateProjectRequest', UpdateProjectRequestSchema);
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
  registry.register('NoteSyncChange', NoteSyncChangeSchema);
  registry.register('TaskSyncChange', TaskSyncChangeSchema);
  registry.register('SyncChange', SyncChangeSchema);
  registry.register('SyncChangesResponse', SyncChangesResponseSchema);
  registry.register(
    'UpgradeRequiredErrorResponse',
    UpgradeRequiredErrorResponseSchema,
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
      200: ok(PostSchema, 'Post'),
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
    summary:
      'Publish post (copies draft to PUBLISHED snapshot; stream rebuild)',
    tags: ['Posts'],
    security: [{ bearerAuth: [] }],
    request: { params: PostIdParamsSchema, ...versionOnlyBody },
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
    request: { params: PostIdParamsSchema, ...versionOnlyBody },
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
    request: { params: PostIdParamsSchema, ...versionOnlyBody },
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
    request: { params: PostIdParamsSchema, ...versionOnlyBody },
    responses: {
      200: ok(PostSchema, 'Soft-deleted'),
      400: r400,
      404: r404,
      409: r409,
      ...adminAuth,
    },
  });

  registerProjectPaths(registry);
  registerUserPaths(registry);

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
    summary:
      'Publish home (copies draft to PUBLISHED snapshot; stream rebuild)',
    tags: ['Home'],
    security: [{ bearerAuth: [] }],
    request: versionOnlyBody,
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
    request: versionOnlyBody,
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
    request: versionOnlyBody,
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
    summary:
      'Publish resume (copies draft to PUBLISHED snapshot; regenerates PDF)',
    tags: ['Resume'],
    security: [{ bearerAuth: [] }],
    request: versionOnlyBody,
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
    request: versionOnlyBody,
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
    request: versionOnlyBody,
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

  registerNotebookEntityPaths(registry, {
    path: '/api/notebook/notes',
    noun: 'note',
    entity: NoteSchema,
    listQuery: ListNotesQuerySchema,
    listResponse: NoteListResponseSchema,
    createRequest: CreateNoteRequestSchema,
    updateRequest: UpdateNoteRequestSchema,
    extraPaths: () => {
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
        method: 'post',
        path: '/api/notebook/notes/daily/{area}/{date}/open',
        summary:
          'Open the daily note; on first open, creates it with open tasks from earlier days under Carried in',
        tags: ['Notebook'],
        security: [{ bearerAuth: [] }],
        request: {
          params: DailyNoteParamsSchema,
          body: {
            content: {
              'application/json': { schema: OpenDailyNoteRequestSchema },
            },
          },
        },
        responses: {
          200: okWithEtag(
            DailyNoteGetResponseSchema,
            'Daily note (with ETag), or the empty draft (no ETag) when nothing carries in',
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
    },
  });

  registerNotebookEntityPaths(registry, {
    path: '/api/notebook/tasks',
    noun: 'task',
    listSummary:
      'List tasks for the authenticated user (server-sorted: carried over, start date, priority)',
    entity: TaskSchema,
    listQuery: ListTasksQuerySchema,
    listResponse: TaskListResponseSchema,
    createRequest: CreateTaskRequestSchema,
    updateRequest: UpdateTaskRequestSchema,
    extraPaths: (idParams) => {
      registry.registerPath({
        method: 'post',
        path: '/api/notebook/tasks/{id}/complete',
        summary: 'Mark a task done (sets completedAt)',
        tags: ['Notebook'],
        security: [{ bearerAuth: [] }],
        request: {
          params: idParams,
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
          params: idParams,
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
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/notebook/search',
    summary: 'Search notes and tasks for the authenticated user',
    description:
      'Search terms travel in the JSON body, never the URL, so they stay out of CloudFront and API Gateway access logs.',
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
    request: {
      query: SyncChangesQuerySchema,
      headers: ClientVersionHeadersSchema,
    },
    responses: {
      200: ok(SyncChangesResponseSchema, 'Sync change feed page'),
      400: r400,
      426: {
        description: `Client build older than the server minimum (\`upgrade_required\`; header \`${CLIENT_VERSION_HEADER}\`)`,
        ...jsonBody(UpgradeRequiredErrorResponseSchema),
      },
      ...notebookAuth,
      500: err(
        'Internal error (including a sync row with no registered adapter)',
      ),
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
  return addPrefixForbidden(
    requireRequestBodies(
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
    ),
  );
}

type OpenApiDocument = ReturnType<OpenApiGeneratorV3['generateDocument']>;

export const PREFIX_FORBIDDEN_DESCRIPTIONS = {
  '/api/admin/users':
    'Forbidden: the token is not an `admin-web` client token with the `user-admin` group',
  '/api/admin':
    'Forbidden: the token is not an `admin-web` client token with the `site-admin` group',
  '/api/notebook':
    'Forbidden: the token is not a `notebook-web` client token with the `notebook` group',
} as const;

type ForbiddenPrefix = keyof typeof PREFIX_FORBIDDEN_DESCRIPTIONS;

/** The longest prefix wins, so `/api/admin/users` overrides `/api/admin`. */
export function forbiddenPrefixFor(path: string): ForbiddenPrefix | undefined {
  return (Object.keys(PREFIX_FORBIDDEN_DESCRIPTIONS) as ForbiddenPrefix[])
    .filter((p) => path === p || path.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
}

/** The router applies the same 403 rule to every route under a prefix, so it is documented per prefix, not per route. */
function addPrefixForbidden(doc: OpenApiDocument): OpenApiDocument {
  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    const prefix = forbiddenPrefixFor(path);
    if (!prefix) continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!op || typeof op !== 'object' || !('responses' in op)) continue;
      const unauthorized = op.responses['401'];
      if (!unauthorized || '$ref' in unauthorized) {
        throw new Error(`${method.toUpperCase()} ${path} has no inline 401`);
      }
      op.responses['403'] = {
        ...unauthorized,
        description: PREFIX_FORBIDDEN_DESCRIPTIONS[prefix],
      };
    }
  }
  return doc;
}

/**
 * Otherwise openapi-typescript makes `body` optional and a mutation called
 * without its body still typechecks.
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
