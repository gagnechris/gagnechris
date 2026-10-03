import { z } from 'zod';
import { API_SERVICE_NAME } from './constants.js';
import { MAX_SLUG_LENGTH } from './slugify.js';

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal(API_SERVICE_NAME),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const AdminMeResponseSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
  username: z.string().optional(),
});

export type AdminMeResponse = z.infer<typeof AdminMeResponseSchema>;

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  /** Per-field Zod issue codes (e.g. `{ email: "invalid_format" }`). */
  fields: z.record(z.string(), z.string()).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** 409 conflict body with optional current entity for client reconciliation. */
export const ConflictErrorResponseSchema = ErrorResponseSchema.extend({
  error: z.enum([
    'conflict',
    'version_conflict',
    'deleted',
    'payload_mismatch',
    'slug_taken',
    'daily_taken',
  ]),
  currentVersion: z.number().int().optional(),
  current: z.unknown().optional(),
});

export type ConflictErrorResponse = z.infer<typeof ConflictErrorResponseSchema>;

/** 412 body when If-Match version mismatches (CHR-171). */
export const PreconditionFailedErrorResponseSchema = ErrorResponseSchema.extend(
  {
    error: z.literal('precondition_failed'),
    currentVersion: z.number().int().optional(),
    current: z.unknown().optional(),
  },
);

export type PreconditionFailedErrorResponse = z.infer<
  typeof PreconditionFailedErrorResponseSchema
>;

export const PostStatusSchema = z.enum(['draft', 'published', 'deleted']);

export type PostStatus = z.infer<typeof PostStatusSchema>;

/** Shared publish lifecycle fields for Post / Home / Resume (CHR-128). */
export const PublishableFieldsSchema = z.object({
  status: PostStatusSchema,
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
  version: z.number().int().nonnegative(),
  hasUnpublishedChanges: z.boolean(),
});

export type PublishableFields = z.infer<typeof PublishableFieldsSchema>;

export const PostSeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  ogImage: z.string().optional(),
});

export type PostSeo = z.infer<typeof PostSeoSchema>;

export const PostSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string(),
    excerpt: z.string(),
    bodyMarkdown: z.string(),
    tags: z.array(z.string()),
    coverImage: z.string().nullable(),
    seo: PostSeoSchema.nullable(),
  })
  .merge(PublishableFieldsSchema);

export type Post = z.infer<typeof PostSchema>;

export const PostListResponseSchema = z.object({
  items: z.array(PostSchema),
  /** Opaque cursor for the next page (absent when no more items). */
  nextCursor: z.string().min(1).optional(),
});

export type PostListResponse = z.infer<typeof PostListResponseSchema>;

export const CreatePostRequestSchema = z.object({
  title: z.string().min(1).default('Untitled'),
  slug: z.string().min(1).max(MAX_SLUG_LENGTH).optional(),
  excerpt: z.string().default(''),
  bodyMarkdown: z.string().default(''),
  tags: z.array(z.string()).default([]),
  coverImage: z.string().nullable().optional(),
  seo: PostSeoSchema.nullable().optional(),
});

export type CreatePostRequest = z.infer<typeof CreatePostRequestSchema>;

export const UpdatePostRequestSchema = z.object({
  version: z.number().int().nonnegative(),
  title: z.string().min(1).optional(),
  slug: z.string().min(1).max(MAX_SLUG_LENGTH).optional(),
  excerpt: z.string().optional(),
  bodyMarkdown: z.string().optional(),
  tags: z.array(z.string()).optional(),
  coverImage: z.string().nullable().optional(),
  seo: PostSeoSchema.nullable().optional(),
});

export type UpdatePostRequest = z.infer<typeof UpdatePostRequestSchema>;

/** Query params for `GET /admin/posts` (API + OpenAPI — CHR-154 / CHR-171). */
export const ListPostsQuerySchema = z.object({
  status: PostStatusSchema.optional().describe('Filter by post status'),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe('Opaque pagination cursor from a previous list response'),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Page size (1-100)'),
});

export type ListPostsQuery = z.infer<typeof ListPostsQuerySchema>;

/** Body for publish / unpublish / discard / delete (CHR-129). */
export const ExpectedVersionRequestSchema = z.object({
  version: z.number().int().nonnegative(),
});

export type ExpectedVersionRequest = z.infer<
  typeof ExpectedVersionRequestSchema
>;

/** Allowed Content-Type values for admin media uploads (CHR-31). */
export const MEDIA_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const MediaContentTypeSchema = z.enum(MEDIA_CONTENT_TYPES);

export type MediaContentType = z.infer<typeof MediaContentTypeSchema>;

/** Max upload size enforced via signed Content-Length (10 MiB). */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export const MediaUploadUrlRequestSchema = z.object({
  contentType: MediaContentTypeSchema,
  contentLength: z.number().int().positive().max(MEDIA_MAX_BYTES),
  filename: z.string().min(1).max(200).optional(),
});

export type MediaUploadUrlRequest = z.infer<typeof MediaUploadUrlRequestSchema>;

export const MediaUploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  publicPath: z.string().regex(/^\/media\//),
  headers: z.object({
    'Content-Type': z.string(),
  }),
  expiresAt: z.string().datetime({ offset: true }),
});

export type MediaUploadUrlResponse = z.infer<
  typeof MediaUploadUrlResponseSchema
>;

export const ContactRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(200, 'Name is too long'),
  email: z
    .string()
    .trim()
    .email('Enter a valid email address')
    .max(320, 'Email is too long'),
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(10_000, 'Message is too long'),
  /**
   * Honeypot — must be empty. Non-semantic name resists autofill (CHR-98).
   * Legacy `website` still accepted so old bots keep triggering the trap.
   */
  hp_field: z.string().max(200).optional().default(''),
  website: z.string().max(200).optional().default(''),
  /**
   * Client-measured time from form open to submit (performance.now delta).
   * Preferred over formStartedAt — avoids server/browser clock skew (CHR-114).
   */
  elapsedMs: z.number().int().nonnegative().optional(),
  /** @deprecated Prefer elapsedMs. Client form-open time (ms since epoch). */
  formStartedAt: z.number().int().nonnegative().optional(),
});

export type ContactRequest = z.infer<typeof ContactRequestSchema>;

export const ContactResponseSchema = z.object({
  ok: z.literal(true),
});

export type ContactResponse = z.infer<typeof ContactResponseSchema>;

export const HomeSchema = z
  .object({
    name: z.string().min(1),
    title: z.string(),
    about: z.string(),
    seo: PostSeoSchema.nullable(),
  })
  .merge(PublishableFieldsSchema);

export type Home = z.infer<typeof HomeSchema>;

export const UpdateHomeRequestSchema = z.object({
  version: z.number().int().nonnegative(),
  name: z.string().min(1).optional(),
  title: z.string().optional(),
  about: z.string().optional(),
  seo: PostSeoSchema.nullable().optional(),
});

export type UpdateHomeRequest = z.infer<typeof UpdateHomeRequestSchema>;

export const ResumeExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  bullets: z.array(z.string()),
});

export type ResumeExperience = z.infer<typeof ResumeExperienceSchema>;

export const ResumeEducationSchema = z.object({
  title: z.string(),
  institution: z.string(),
  location: z.string(),
  year: z.string(),
  degreeDetail: z.string().optional(),
});

export type ResumeEducation = z.infer<typeof ResumeEducationSchema>;

export const ResumeContentSchema = z.object({
  summary: z.string(),
  competencies: z.array(z.string()),
  experience: z.array(ResumeExperienceSchema),
  skills: z.array(z.string()),
  education: z.array(ResumeEducationSchema),
});

export type ResumeContent = z.infer<typeof ResumeContentSchema>;

export const ResumeSchema = z
  .object({
    name: z.string().min(1),
    pdfPath: z.string().min(1),
    content: ResumeContentSchema,
    seo: PostSeoSchema.nullable(),
  })
  .merge(PublishableFieldsSchema);

export type Resume = z.infer<typeof ResumeSchema>;

export const UpdateResumeRequestSchema = z.object({
  version: z.number().int().nonnegative(),
  name: z.string().min(1).optional(),
  pdfPath: z.string().min(1).optional(),
  content: ResumeContentSchema.optional(),
  seo: PostSeoSchema.nullable().optional(),
});

export type UpdateResumeRequest = z.infer<typeof UpdateResumeRequestSchema>;

export const ResumeDownloadNotifyRequestSchema = z.object({
  /** Optional client context (no PII required). */
  referrer: z.string().max(500).optional(),
});

export type ResumeDownloadNotifyRequest = z.infer<
  typeof ResumeDownloadNotifyRequestSchema
>;

export const ResumeDownloadNotifyResponseSchema = z.object({
  ok: z.literal(true),
});

export type ResumeDownloadNotifyResponse = z.infer<
  typeof ResumeDownloadNotifyResponseSchema
>;

/**
 * Crockford ULID (26 chars) — client-generated for idempotent creates (CHR-141).
 * Uppercase pattern with no `/i` flag so OpenAPI emits a valid ECMA-262 pattern
 * (CHR-171). Input is normalized to uppercase before the regex check.
 */
export const ULID_PATTERN = '^[0-7][0-9A-HJKMNP-TV-Z]{25}$';

export const UlidSchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.toUpperCase() : val),
  z.string().regex(new RegExp(ULID_PATTERN), 'Must be a ULID'),
);

/** Calendar day in the owner's local notebook sense (`yyyy-mm-dd`). */
export const CALENDAR_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

export const CalendarDateSchema = z
  .string()
  .regex(new RegExp(CALENDAR_DATE_PATTERN), 'Must be yyyy-mm-dd');

export type CalendarDate = z.infer<typeof CalendarDateSchema>;

export const NotebookAreaSchema = z.enum(['work', 'personal']);

export type NotebookArea = z.infer<typeof NotebookAreaSchema>;

export const NoteTypeSchema = z.enum(['daily', 'page']);

export type NoteType = z.infer<typeof NoteTypeSchema>;

export const TaskPrioritySchema = z.enum(['low', 'med', 'high']);

export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'done']);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * Notebook note API entity (CHR-39). Soft-deleted rows keep `deleted: true`
 * for the sync tombstone window; list indexes omit them.
 */
export const NoteSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    area: NotebookAreaSchema,
    type: NoteTypeSchema,
    /** Required when `type` is `daily`; null for freeform pages. */
    date: CalendarDateSchema.nullable(),
    title: z.string(),
    bodyMarkdown: z.string(),
    tags: z.array(z.string()),
    pinned: z.boolean(),
    version: z.number().int().nonnegative(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    deleted: z.boolean(),
  })
  .superRefine((note, ctx) => {
    if (note.type === 'daily' && note.date === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Daily notes require date (yyyy-mm-dd)',
        path: ['date'],
      });
    }
    if (note.type === 'page' && note.date !== null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Page notes must not set date',
        path: ['date'],
      });
    }
  });

export type Note = z.infer<typeof NoteSchema>;

export const NoteListResponseSchema = z.object({
  items: z.array(NoteSchema),
  nextCursor: z.string().min(1).optional(),
});

export type NoteListResponse = z.infer<typeof NoteListResponseSchema>;

export const CreateNoteRequestSchema = z
  .object({
    id: UlidSchema,
    area: NotebookAreaSchema,
    type: NoteTypeSchema,
    date: CalendarDateSchema.optional(),
    title: z.string().default(''),
    bodyMarkdown: z.string().default(''),
    tags: z.array(z.string()).default([]),
    pinned: z.boolean().default(false),
  })
  .superRefine((body, ctx) => {
    if (body.type === 'daily' && body.date === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Daily notes require date (yyyy-mm-dd)',
        path: ['date'],
      });
    }
    if (body.type === 'page' && body.date !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Page notes must not set date',
        path: ['date'],
      });
    }
  });

export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;

/**
 * PUT note body. `version` may be omitted when `If-Match` carries the
 * expectation (CHR-186); the route still requires one of the two.
 */
export const UpdateNoteRequestSchema = z.object({
  version: z.number().int().nonnegative().optional(),
  title: z.string().optional(),
  bodyMarkdown: z.string().optional(),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
  area: NotebookAreaSchema.optional(),
});

export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>;

/** Query params for `GET /notebook/notes` (CHR-40). */
export const ListNotesQuerySchema = z.object({
  area: NotebookAreaSchema.optional().describe('Filter by Work or Personal'),
  from: CalendarDateSchema.optional().describe(
    'Inclusive start date (yyyy-mm-dd) for calendar ranges',
  ),
  to: CalendarDateSchema.optional().describe(
    'Inclusive end date (yyyy-mm-dd) for calendar ranges',
  ),
  type: NoteTypeSchema.optional().describe('Filter by daily or page notes'),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe('Opaque pagination cursor from a previous list response'),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Page size (1-100)'),
});

export type ListNotesQuery = z.infer<typeof ListNotesQuerySchema>;

/** Empty daily-note placeholder when no claim exists yet (CHR-40 GET daily). */
export const EmptyDailyNoteSchema = z.object({
  exists: z.literal(false),
  userId: z.string().min(1),
  area: NotebookAreaSchema,
  type: z.literal('daily'),
  date: CalendarDateSchema,
  title: z.literal(''),
  bodyMarkdown: z.literal(''),
  tags: z.array(z.string()).length(0),
  pinned: z.literal(false),
  version: z.literal(0),
});

export type EmptyDailyNote = z.infer<typeof EmptyDailyNoteSchema>;

/** GET daily: persisted Note or empty draft placeholder. */
export const DailyNoteGetResponseSchema = z.union([
  NoteSchema,
  EmptyDailyNoteSchema,
]);

export type DailyNoteGetResponse = z.infer<typeof DailyNoteGetResponseSchema>;

/** PUT /notebook/notes/daily/{area}/{date} body (CHR-40). */
export const UpsertDailyNoteRequestSchema = z.object({
  id: UlidSchema.describe('Client ULID used when creating the daily note'),
  version: z.number().int().nonnegative().optional(),
  title: z.string().optional(),
  bodyMarkdown: z.string().optional(),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
});

export type UpsertDailyNoteRequest = z.infer<
  typeof UpsertDailyNoteRequestSchema
>;

/**
 * Notebook task API entity (CHR-39). `dueDate` is a calendar day; undated
 * tasks sort separately from due/overdue ranges in Dynamo (UPDATED# prefix).
 */
export const TaskSchema = z.object({
  id: UlidSchema,
  userId: z.string().min(1),
  area: NotebookAreaSchema,
  title: z.string().min(1),
  description: z.string(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  dueDate: CalendarDateSchema.nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  noteId: z.string().min(1).nullable(),
  tags: z.array(z.string()),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  deleted: z.boolean(),
});

export type Task = z.infer<typeof TaskSchema>;

export const TaskListResponseSchema = z.object({
  items: z.array(TaskSchema),
  nextCursor: z.string().min(1).optional(),
});

export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;

export const CreateTaskRequestSchema = z.object({
  id: UlidSchema,
  area: NotebookAreaSchema,
  title: z.string().min(1),
  description: z.string().default(''),
  priority: TaskPrioritySchema.default('med'),
  status: TaskStatusSchema.default('todo'),
  dueDate: CalendarDateSchema.nullable().optional(),
  noteId: UlidSchema.nullable().optional(),
  tags: z.array(z.string()).default([]),
});

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

/**
 * PUT task body. `version` may be omitted when `If-Match` carries the
 * expectation (CHR-186); the route still requires one of the two.
 */
export const UpdateTaskRequestSchema = z.object({
  version: z.number().int().nonnegative().optional(),
  area: NotebookAreaSchema.optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: TaskPrioritySchema.optional(),
  status: TaskStatusSchema.optional(),
  dueDate: CalendarDateSchema.nullable().optional(),
  noteId: UlidSchema.nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

/** Query params for `GET /notebook/tasks` (CHR-43). */
export const ListTasksQuerySchema = z.object({
  area: NotebookAreaSchema.optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  dueOn: CalendarDateSchema.optional().describe('Tasks due on this date'),
  dueBefore: CalendarDateSchema.optional().describe(
    'Tasks due strictly before this date (overdue-style ranges)',
  ),
  noteId: z.string().min(1).optional().describe('Tasks linked to a note'),
  open: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .describe('Only todo and in_progress tasks (ignored when status is set)'),
  today: CalendarDateSchema.optional().describe(
    "Caller's local day (yyyy-mm-dd) for overdue ranking; defaults to UTC today",
  ),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;

/** Query params for `GET /notebook/search` (CHR-46). */
export const NotebookSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  area: NotebookAreaSchema.optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export type NotebookSearchQuery = z.infer<typeof NotebookSearchQuerySchema>;

export const NotebookSearchHitSchema = z.object({
  type: z.enum(['note', 'task']),
  id: z.string().min(1),
  area: NotebookAreaSchema,
  title: z.string(),
  snippet: z.string(),
  /** Character ranges into `snippet` for client highlighting. */
  matches: z.array(
    z.object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    }),
  ),
});

export type NotebookSearchHit = z.infer<typeof NotebookSearchHitSchema>;

export const NotebookSearchResponseSchema = z.object({
  notes: z.array(NotebookSearchHitSchema),
  tasks: z.array(NotebookSearchHitSchema),
});

export type NotebookSearchResponse = z.infer<
  typeof NotebookSearchResponseSchema
>;

/**
 * Sync change wire types (CHR-172 / CHR-39). Discriminated by `type` so
 * generated clients type `entity` per change type. `fakeNote` remains the
 * contract fixture (test-only routes) alongside real `note` / `task`.
 */

export const FakeNoteEntitySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  title: z.string(),
  body: z.string(),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  deleted: z.boolean(),
  area: NotebookAreaSchema.optional(),
  noteDate: z.string().optional(),
});

export type FakeNoteEntity = z.infer<typeof FakeNoteEntitySchema>;

export const FakeNoteSyncChangeSchema = z.object({
  type: z.literal('fakeNote'),
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  deleted: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
  /** Present when not deleted (full entity for convenience). */
  entity: FakeNoteEntitySchema.optional(),
});

export type FakeNoteSyncChange = z.infer<typeof FakeNoteSyncChangeSchema>;

export const NoteSyncChangeSchema = z.object({
  type: z.literal('note'),
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  deleted: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
  entity: NoteSchema.optional(),
});

export type NoteSyncChange = z.infer<typeof NoteSyncChangeSchema>;

export const TaskSyncChangeSchema = z.object({
  type: z.literal('task'),
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  deleted: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
  entity: TaskSchema.optional(),
});

export type TaskSyncChange = z.infer<typeof TaskSyncChangeSchema>;

export const SyncChangeSchema = z.discriminatedUnion('type', [
  FakeNoteSyncChangeSchema,
  NoteSyncChangeSchema,
  TaskSyncChangeSchema,
]);

export type SyncChange = z.infer<typeof SyncChangeSchema>;

export const SyncChangesResponseSchema = z.object({
  changes: z.array(SyncChangeSchema),
  nextCursor: z.string().min(1).optional(),
  /**
   * Server watermark (ISO-8601). Opaque to clients except that it must be
   * echoed as `since` on the next poll (CHR-172).
   */
  nextSince: z.string().datetime({ offset: true }),
});

export type SyncChangesResponse = z.infer<typeof SyncChangesResponseSchema>;

/** Default page size when `limit` is omitted (avoids ~1 MB Dynamo pages). */
export const SYNC_DEFAULT_PAGE_LIMIT = 50;

export const SyncChangesQuerySchema = z.object({
  since: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      'ISO-8601 watermark from a prior nextSince; omit for a full resync. Older than the tombstone horizon → 410 resync_required',
    ),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe('Opaque pagination cursor from a previous sync page'),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe(`Page size (1-100; default ${SYNC_DEFAULT_PAGE_LIMIT})`),
});

export type SyncChangesQuery = z.infer<typeof SyncChangesQuerySchema>;
