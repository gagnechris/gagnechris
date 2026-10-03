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
  fields: z.record(z.string(), z.string()).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

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

export const ExpectedVersionRequestSchema = z.object({
  version: z.number().int().nonnegative(),
});

export type ExpectedVersionRequest = z.infer<
  typeof ExpectedVersionRequestSchema
>;

export const MEDIA_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const MediaContentTypeSchema = z.enum(MEDIA_CONTENT_TYPES);

export type MediaContentType = z.infer<typeof MediaContentTypeSchema>;

/** Enforced via the signed Content-Length. */
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
   * Honeypot: must be empty. Non-semantic name resists autofill; `website` is
   * still accepted so old bots keep triggering the trap.
   */
  hp_field: z.string().max(200).optional().default(''),
  website: z.string().max(200).optional().default(''),
  /** Preferred over formStartedAt: a client-side delta avoids clock skew. */
  elapsedMs: z.number().int().nonnegative().optional(),
  /** @deprecated Prefer elapsedMs. */
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
 * No `/i` flag so OpenAPI emits a valid ECMA-262 pattern; input is
 * uppercased before the regex check.
 */
export const ULID_PATTERN = '^[0-7][0-9A-HJKMNP-TV-Z]{25}$';

export const UlidSchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.toUpperCase() : val),
  z.string().regex(new RegExp(ULID_PATTERN), 'Must be a ULID'),
);

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

/** Well under DynamoDB's 400 KB item cap so oversize is a 413, not a 500. */
export const NOTEBOOK_TEXT_MAX_BYTES = 100_000;
export const NOTEBOOK_TITLE_MAX_LENGTH = 300;
export const NOTEBOOK_TAG_MAX_LENGTH = 50;
export const NOTEBOOK_TAGS_MAX = 50;

/** Avoids TextEncoder so it works in React Native. */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      bytes += 4;
      i += 1;
    } else bytes += 3;
  }
  return bytes;
}

const NotebookTextSchema = z
  .string()
  .superRefine((value, ctx) => {
    if (utf8ByteLength(value) > NOTEBOOK_TEXT_MAX_BYTES) {
      ctx.addIssue({
        code: 'too_big',
        origin: 'string',
        maximum: NOTEBOOK_TEXT_MAX_BYTES,
        inclusive: true,
        input: value,
        message: `Text is over the ${NOTEBOOK_TEXT_MAX_BYTES / 1000} KB limit`,
      });
    }
  })
  .describe(`Up to ${NOTEBOOK_TEXT_MAX_BYTES / 1000} KB (UTF-8); larger → 413`);

const NotebookTitleSchema = z.string().max(NOTEBOOK_TITLE_MAX_LENGTH);

const NotebookTagsSchema = z
  .array(z.string().max(NOTEBOOK_TAG_MAX_LENGTH))
  .max(NOTEBOOK_TAGS_MAX);

/** Soft-deleted rows keep `deleted: true` for the sync tombstone window. */
export const NoteSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    area: NotebookAreaSchema,
    type: NoteTypeSchema,
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
    title: NotebookTitleSchema.default(''),
    bodyMarkdown: NotebookTextSchema.default(''),
    tags: NotebookTagsSchema.default([]),
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

/** `version` may come from `If-Match` instead; one of the two is required. */
export const UpdateNoteRequestSchema = z.object({
  version: z.number().int().nonnegative().optional(),
  title: NotebookTitleSchema.optional(),
  bodyMarkdown: NotebookTextSchema.optional(),
  tags: NotebookTagsSchema.optional(),
  pinned: z.boolean().optional(),
  area: NotebookAreaSchema.optional(),
});

export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>;

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

export const DailyNoteGetResponseSchema = z.union([
  NoteSchema,
  EmptyDailyNoteSchema,
]);

export type DailyNoteGetResponse = z.infer<typeof DailyNoteGetResponseSchema>;

export const UpsertDailyNoteRequestSchema = z.object({
  id: UlidSchema.describe('Client ULID used when creating the daily note'),
  version: z.number().int().nonnegative().optional(),
  title: NotebookTitleSchema.optional(),
  bodyMarkdown: NotebookTextSchema.optional(),
  tags: NotebookTagsSchema.optional(),
  pinned: z.boolean().optional(),
});

export type UpsertDailyNoteRequest = z.infer<
  typeof UpsertDailyNoteRequestSchema
>;

/** Undated tasks sort separately from due ranges in Dynamo (UPDATED# prefix). */
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
  title: NotebookTitleSchema.min(1),
  description: NotebookTextSchema.default(''),
  priority: TaskPrioritySchema.default('med'),
  status: TaskStatusSchema.default('todo'),
  dueDate: CalendarDateSchema.nullable().optional(),
  noteId: UlidSchema.nullable().optional(),
  tags: NotebookTagsSchema.default([]),
});

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

/** `version` may come from `If-Match` instead; one of the two is required. */
export const UpdateTaskRequestSchema = z.object({
  version: z.number().int().nonnegative().optional(),
  area: NotebookAreaSchema.optional(),
  title: NotebookTitleSchema.min(1).optional(),
  description: NotebookTextSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  status: TaskStatusSchema.optional(),
  dueDate: CalendarDateSchema.nullable().optional(),
  noteId: UlidSchema.nullable().optional(),
  tags: NotebookTagsSchema.optional(),
});

export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

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

/** A body, not a query string, so terms stay out of CDN and API access logs. */
export const NotebookSearchRequestSchema = z.object({
  q: z.string().trim().min(1).max(200),
  area: NotebookAreaSchema.optional(),
  limit: z.number().int().positive().max(50).optional(),
});

export type NotebookSearchRequest = z.infer<typeof NotebookSearchRequestSchema>;

export const NotebookSearchHitSchema = z.object({
  type: z.enum(['note', 'task']),
  id: z.string().min(1),
  area: NotebookAreaSchema,
  title: z.string(),
  snippet: z.string(),
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
 * Discriminated by `type` so generated clients type `entity` per change type.
 * Test-only change types use {@link syncChangeSchemaFor} and never join this union.
 */
export function syncChangeSchemaFor<T extends string, E extends z.ZodType>(
  type: T,
  entity: E,
) {
  const meta = {
    type: z.literal(type),
    id: z.string().min(1),
    version: z.number().int().nonnegative(),
    updatedAt: z.string().datetime({ offset: true }),
  };
  return z.discriminatedUnion('deleted', [
    z.object({ ...meta, deleted: z.literal(false), entity }),
    z.object({ ...meta, deleted: z.literal(true) }),
  ]);
}

export const NoteSyncChangeSchema = syncChangeSchemaFor('note', NoteSchema);

export type NoteSyncChange = z.infer<typeof NoteSyncChangeSchema>;

export const TaskSyncChangeSchema = syncChangeSchemaFor('task', TaskSchema);

export type TaskSyncChange = z.infer<typeof TaskSyncChangeSchema>;

export const SyncChangeSchema = z.discriminatedUnion('type', [
  NoteSyncChangeSchema,
  TaskSyncChangeSchema,
]);

export type SyncChange = z.infer<typeof SyncChangeSchema>;

export type SyncChangeType = SyncChange['type'];

export const SYNC_CHANGE_TYPES: readonly SyncChangeType[] =
  SyncChangeSchema.options.map(
    (variant) => variant.options[0].shape.type.value,
  );

export const SyncChangesResponseSchema = z.object({
  changes: z.array(SyncChangeSchema),
  nextCursor: z.string().min(1).optional(),
  /** Opaque to clients except that it must be echoed as `since` on the next poll. */
  nextSince: z.string().datetime({ offset: true }),
});

export type SyncChangesResponse = z.infer<typeof SyncChangesResponseSchema>;

export type DecodedSyncChangesPage = SyncChangesResponse & {
  skippedTypes: string[];
};

/**
 * Unknown change types (from a newer server) are skipped and reported rather
 * than failing the whole page; everything else is validated strictly.
 */
export function decodeSyncChangesResponse(
  input: unknown,
): DecodedSyncChangesPage {
  const envelope = SyncChangesResponseSchema.extend({
    changes: z.array(z.unknown()),
  }).parse(input);
  const known = new Set<string>(SYNC_CHANGE_TYPES);
  const skippedTypes: string[] = [];
  const changes = envelope.changes.filter((change) => {
    const type =
      change && typeof change === 'object' && 'type' in change
        ? change.type
        : undefined;
    if (typeof type === 'string' && !known.has(type)) {
      skippedTypes.push(type);
      return false;
    }
    return true;
  });
  return {
    ...SyncChangesResponseSchema.parse({ ...envelope, changes }),
    skippedTypes,
  };
}

/** Small enough to avoid ~1 MB Dynamo pages. */
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

/** Absent is allowed (web); below {@link SYNC_MIN_CLIENT_VERSION} is a 426. */
export const CLIENT_VERSION_HEADER = 'x-gagnechris-client-version';

/** Raise it (and deploy) to force upgrades or kill-switch a broken client release. */
export const SYNC_MIN_CLIENT_VERSION = '0.0.0';

const CLIENT_VERSION_RE = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/;

export function parseClientVersion(
  raw: string,
): [number, number, number] | undefined {
  const m = CLIENT_VERSION_RE.exec(raw.trim());
  if (!m) return undefined;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function isClientVersionSupported(
  version: [number, number, number],
  minimum: [number, number, number],
): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (version[i]! !== minimum[i]!) return version[i]! > minimum[i]!;
  }
  return true;
}

export const ClientVersionHeadersSchema = z.object({
  [CLIENT_VERSION_HEADER]: z
    .string()
    .regex(CLIENT_VERSION_RE)
    .optional()
    .describe(
      'Client build version (`MAJOR.MINOR.PATCH`). Omit from web; below the server minimum → 426 `upgrade_required`',
    ),
});

export const UpgradeRequiredErrorResponseSchema = ErrorResponseSchema.extend({
  error: z.literal('upgrade_required'),
  minClientVersion: z.string(),
});

export type UpgradeRequiredErrorResponse = z.infer<
  typeof UpgradeRequiredErrorResponseSchema
>;
