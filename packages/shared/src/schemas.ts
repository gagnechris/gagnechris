import * as z from 'zod';
import { isCalendarDay } from './calendar.js';
import { API_SERVICE_NAME } from './constants.js';
import {
  isSafeLinkHref,
  POST_LINK_SCHEMES,
  PROJECT_HREF_SCHEMES,
} from './links.js';
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

export const VersionSchema = z.number().int().nonnegative();

export const PageLimitSchema = z.coerce.number().int().positive().max(100);

export const ExpectedVersionRequestSchema = z.object({
  version: VersionSchema,
});

export type ExpectedVersionRequest = z.infer<
  typeof ExpectedVersionRequestSchema
>;

/** `version` first, then every input field optional. */
const updateRequestSchema = <T extends z.ZodRawShape>(fields: z.ZodObject<T>) =>
  ExpectedVersionRequestSchema.extend(fields.partial().shape);

export const PostStatusSchema = z.enum(['draft', 'published', 'deleted']);

export type PostStatus = z.infer<typeof PostStatusSchema>;

export const PublishableFieldsSchema = z.object({
  status: PostStatusSchema,
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
  version: VersionSchema,
  hasUnpublishedChanges: z.boolean(),
});

export type PublishableFields = z.infer<typeof PublishableFieldsSchema>;

export const PostSeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  ogImage: z.string().optional(),
});

export type PostSeo = z.infer<typeof PostSeoSchema>;

export const POST_PROJECT_IDS_MAX = 20;

/** Ids, not slugs, so renaming a project's slug keeps the tag. */
export const PostProjectIdsSchema = z
  .array(z.string().min(1))
  .max(POST_PROJECT_IDS_MAX);

export const PostSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string(),
    excerpt: z.string(),
    bodyMarkdown: z.string(),
    tags: z.array(z.string()),
    projectIds: z.array(z.string()),
    coverImage: z.string().nullable(),
    seo: PostSeoSchema.nullable(),
  })
  .merge(PublishableFieldsSchema);

export type Post = z.infer<typeof PostSchema>;

/** A list row: everything but the content, which only the editor needs. */
export const PostSummarySchema = PostSchema.omit({
  excerpt: true,
  bodyMarkdown: true,
  coverImage: true,
  seo: true,
});

export type PostSummary = z.infer<typeof PostSummarySchema>;

export const POSTS_PAGE_SIZE = 50;

export const PostCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
});

export type PostCounts = z.infer<typeof PostCountsSchema>;

export const PostListResponseSchema = z.object({
  items: z.array(PostSummarySchema),
  nextCursor: z.string().min(1).optional(),
  counts: PostCountsSchema.optional().describe(
    'Draft and published totals across every page, ignoring `q`. First page only (no `cursor`).',
  ),
});

export type PostListResponse = z.infer<typeof PostListResponseSchema>;

const PostInputFieldsSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).max(MAX_SLUG_LENGTH).optional(),
  excerpt: z.string(),
  bodyMarkdown: z.string(),
  tags: z.array(z.string()),
  projectIds: PostProjectIdsSchema,
  coverImage: z.string().nullable().optional(),
  seo: PostSeoSchema.nullable().optional(),
});

const postFields = PostInputFieldsSchema.shape;

export const CreatePostRequestSchema = PostInputFieldsSchema.extend({
  title: postFields.title.default('Untitled'),
  excerpt: postFields.excerpt.default(''),
  bodyMarkdown: postFields.bodyMarkdown.default(''),
  tags: postFields.tags.default([]),
  projectIds: postFields.projectIds.default([]),
});

export type CreatePostRequest = z.infer<typeof CreatePostRequestSchema>;

export const UpdatePostRequestSchema = updateRequestSchema(
  PostInputFieldsSchema,
);

export type UpdatePostRequest = z.infer<typeof UpdatePostRequestSchema>;

export const POST_SEARCH_MAX_LENGTH = 200;

export const ListPostsQuerySchema = z.object({
  status: PostStatusSchema.optional().describe('Filter by post status'),
  q: z
    .string()
    .trim()
    .max(POST_SEARCH_MAX_LENGTH)
    .optional()
    .describe('Case-insensitive match on title, slug or a tag'),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe('Opaque pagination cursor from a previous list response'),
  limit: PageLimitSchema.optional().describe(
    `Page size (1-100; default ${POSTS_PAGE_SIZE})`,
  ),
});

export type ListPostsQuery = z.infer<typeof ListPostsQuerySchema>;

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

const HomeInputFieldsSchema = z.object({
  name: z.string().min(1),
  title: z.string(),
  about: z.string(),
  seo: PostSeoSchema.nullable(),
});

export const HomeSchema = HomeInputFieldsSchema.merge(PublishableFieldsSchema);

export type Home = z.infer<typeof HomeSchema>;

export const UpdateHomeRequestSchema = updateRequestSchema(
  HomeInputFieldsSchema,
);

export type UpdateHomeRequest = z.infer<typeof UpdateHomeRequestSchema>;

export const RESUME_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const ResumeMonthSchema = z
  .string()
  .regex(RESUME_MONTH_PATTERN, 'Expected YYYY-MM')
  .describe('YYYY-MM');

// Rows without `start` still carry their dates inside `company`; they render
// unchanged until migrated (scripts/migrate-resume-dates.ts).
export const ResumeExperienceSchema = z
  .object({
    title: z.string(),
    company: z.string(),
    bullets: z.array(z.string()),
    start: ResumeMonthSchema.optional(),
    end: ResumeMonthSchema.nullable()
      .optional()
      .describe('YYYY-MM; null means present'),
    note: z.string().optional(),
  })
  .superRefine((item, ctx) => {
    if (item.end != null && item.start === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'end needs a start',
      });
    }
    if (item.end != null && item.start !== undefined && item.end < item.start) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'end is before start',
      });
    }
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
  headline: z.string().optional().describe('Current role'),
  earlierRolesThrough: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .optional()
    .describe('Roles that ended in or before this year are "earlier roles"'),
  summary: z.string(),
  competencies: z.array(z.string()),
  experience: z.array(ResumeExperienceSchema),
  skills: z.array(z.string()),
  education: z.array(ResumeEducationSchema),
});

export type ResumeContent = z.infer<typeof ResumeContentSchema>;

const ResumeInputFieldsSchema = z.object({
  name: z.string().min(1),
  pdfPath: z.string().min(1),
  content: ResumeContentSchema,
  seo: PostSeoSchema.nullable(),
});

export const ResumeSchema = ResumeInputFieldsSchema.merge(
  PublishableFieldsSchema,
);

export type Resume = z.infer<typeof ResumeSchema>;

export const UpdateResumeRequestSchema = updateRequestSchema(
  ResumeInputFieldsSchema,
);

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

/** Not `status`: that is the draft / published field every publishable entity shares. */
export const ProjectStageSchema = z.enum(['idea', 'building', 'live']);

export type ProjectStage = z.infer<typeof ProjectStageSchema>;

export const PROJECT_DEMO_IDS = ['posts', 'notebook'] as const;

export const ProjectDemoSchema = z.enum(PROJECT_DEMO_IDS);

export type ProjectDemo = z.infer<typeof ProjectDemoSchema>;

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_PITCH_MAX_LENGTH = 300;
export const PROJECT_STAGE_NOTE_MAX_LENGTH = 80;
export const PROJECT_STACK_MAX = 30;
export const PROJECT_STACK_ITEM_MAX_LENGTH = 50;
export const PROJECT_LINKS_MAX = 20;
export const PROJECT_LINK_LABEL_MAX_LENGTH = 100;
export const PROJECT_ORDER_MAX = 999_999;

export const ProjectHrefSchema = z
  .string()
  .refine((v) => isSafeLinkHref(v, PROJECT_HREF_SCHEMES), {
    message: 'Must be a site-relative path or an https URL',
  });

export const ProjectLinkSchema = z.object({
  label: z.string().trim().min(1).max(PROJECT_LINK_LABEL_MAX_LENGTH),
  url: z.string().refine((v) => isSafeLinkHref(v, POST_LINK_SCHEMES), {
    message:
      'Must be a site-relative path or an http, https, mailto or tel URL',
  }),
});

export type ProjectLink = z.infer<typeof ProjectLinkSchema>;

export const ProjectPreviewImageSchema = z
  .string()
  .regex(/^\/media\/[^\s?#\\]+$/, 'Must be a /media/ path')
  .refine((v) => !v.split('/').includes('..'), 'Must be a /media/ path');

const ProjectStackSchema = z
  .array(z.string().trim().min(1).max(PROJECT_STACK_ITEM_MAX_LENGTH))
  .max(PROJECT_STACK_MAX);

const ProjectOrderSchema = z.number().int().min(0).max(PROJECT_ORDER_MAX);

export const ProjectSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    pitch: z.string(),
    stage: ProjectStageSchema,
    stageNote: z.string(),
    previewImage: z.string().nullable(),
    bodyMarkdown: z.string(),
    stack: z.array(z.string()),
    links: z.array(ProjectLinkSchema),
    demo: ProjectDemoSchema.nullable(),
    order: z.number().int().nonnegative(),
    /** When set, the project card links here and no `/projects/<slug>` page is generated. */
    href: z.string().nullable(),
  })
  .merge(PublishableFieldsSchema);

export type Project = z.infer<typeof ProjectSchema>;

export const ProjectListResponseSchema = z.object({
  items: z.array(ProjectSchema),
});

export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

const ProjectInputFieldsSchema = z.object({
  name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
  slug: z.string().min(1).max(MAX_SLUG_LENGTH).optional(),
  pitch: z.string().max(PROJECT_PITCH_MAX_LENGTH),
  stage: ProjectStageSchema,
  stageNote: z.string().max(PROJECT_STAGE_NOTE_MAX_LENGTH),
  previewImage: ProjectPreviewImageSchema.nullable().optional(),
  bodyMarkdown: z.string(),
  stack: ProjectStackSchema,
  links: z.array(ProjectLinkSchema).max(PROJECT_LINKS_MAX),
  demo: ProjectDemoSchema.nullable().optional(),
  order: ProjectOrderSchema,
  href: ProjectHrefSchema.nullable().optional(),
});

const projectFields = ProjectInputFieldsSchema.shape;

export const CreateProjectRequestSchema = ProjectInputFieldsSchema.extend({
  pitch: projectFields.pitch.default(''),
  stage: projectFields.stage.default('idea'),
  stageNote: projectFields.stageNote.default(''),
  bodyMarkdown: projectFields.bodyMarkdown.default(''),
  stack: projectFields.stack.default([]),
  links: projectFields.links.default([]),
  order: projectFields.order.default(0),
});

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = updateRequestSchema(
  ProjectInputFieldsSchema,
);

export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

export const ListProjectsQuerySchema = z.object({
  status: z
    .enum(['draft', 'published'])
    .optional()
    .describe('Filter by publish status'),
});

export type ListProjectsQuery = z.infer<typeof ListProjectsQuerySchema>;

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
  .regex(new RegExp(CALENDAR_DATE_PATTERN), 'Must be yyyy-mm-dd')
  .refine(isCalendarDay, 'Must be a real calendar date');

export type CalendarDate = z.infer<typeof CalendarDateSchema>;

export const NotebookAreaSchema = z.enum(['work', 'personal']);

export type NotebookArea = z.infer<typeof NotebookAreaSchema>;

export const NoteTypeSchema = z.enum(['daily', 'page']);

export type NoteType = z.infer<typeof NoteTypeSchema>;

export const TaskPrioritySchema = z.enum(['low', 'med', 'high']);

export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

/** `dropped` closes a task without doing it; like `done`, it is not open. */
export const TaskStatusSchema = z.enum([
  'todo',
  'in_progress',
  'done',
  'dropped',
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const OPEN_TASK_STATUSES = [
  'todo',
  'in_progress',
] as const satisfies readonly TaskStatus[];

export function isOpenTaskStatus(status: TaskStatus): boolean {
  return status === 'todo' || status === 'in_progress';
}

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
    taskIds: z
      .array(UlidSchema)
      .describe(
        'Tasks embedded in bodyMarkdown, derived by the server on every save',
      ),
    version: VersionSchema,
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

/** Most ids one batch read takes: one DynamoDB BatchGetItem. */
export const NOTEBOOK_BATCH_MAX_IDS = 100;

/** Body of the notes and tasks batch reads. */
export const NotebookBatchRequestSchema = z.object({
  ids: z.array(UlidSchema).min(1).max(NOTEBOOK_BATCH_MAX_IDS),
});

export type NotebookBatchRequest = z.infer<typeof NotebookBatchRequestSchema>;

export const NoteBatchResponseSchema = z.object({
  items: z
    .array(NoteSchema)
    .describe(
      'The live notes among the ids, in request order; deleted or unknown ids are left out',
    ),
});

export type NoteBatchResponse = z.infer<typeof NoteBatchResponseSchema>;

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
  version: VersionSchema.optional(),
  title: NotebookTitleSchema.optional(),
  bodyMarkdown: NotebookTextSchema.optional(),
  tags: NotebookTagsSchema.optional(),
  pinned: z.boolean().optional(),
  area: NotebookAreaSchema.optional(),
});

export type UpdateNoteRequest = z.infer<typeof UpdateNoteRequestSchema>;

/** Default page size for notes and tasks lists, one area or many. */
export const NOTEBOOK_PAGE_SIZE = 50;

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
  limit: PageLimitSchema.optional().describe(
    `Page size (1-100; default ${NOTEBOOK_PAGE_SIZE})`,
  ),
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
  version: VersionSchema.optional(),
  title: NotebookTitleSchema.optional(),
  bodyMarkdown: NotebookTextSchema.optional(),
  tags: NotebookTagsSchema.optional(),
  pinned: z.boolean().optional(),
});

export type UpsertDailyNoteRequest = z.infer<
  typeof UpsertDailyNoteRequestSchema
>;

export const OpenDailyNoteRequestSchema = z.object({
  id: UlidSchema.describe(
    'Client ULID used if opening creates the daily note with carried-in tasks',
  ),
});

export type OpenDailyNoteRequest = z.infer<typeof OpenDailyNoteRequestSchema>;

/**
 * `startDate` is the day a task shows on Today; `null` means now. `someday`
 * tasks never show on Today and always have a `null` startDate. `dueDate` is
 * stored and returned but no longer drives Today or Upcoming.
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
  startDate: CalendarDateSchema.nullable(),
  someday: z.boolean(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
  noteId: z.string().min(1).nullable(),
  tags: z.array(z.string()),
  version: VersionSchema,
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

export const TaskBatchResponseSchema = z.object({
  items: z
    .array(TaskSchema)
    .describe(
      'The live tasks among the ids, in request order; deleted or unknown ids are left out',
    ),
});

export type TaskBatchResponse = z.infer<typeof TaskBatchResponseSchema>;

function rejectDatedSomeday(
  body: { startDate?: string | null; someday?: boolean },
  ctx: z.RefinementCtx,
): void {
  if (body.someday === true && body.startDate != null) {
    ctx.addIssue({
      code: 'custom',
      message: 'Someday tasks have no startDate',
      path: ['startDate'],
    });
  }
}

export const CreateTaskRequestSchema = z
  .object({
    id: UlidSchema,
    area: NotebookAreaSchema,
    title: NotebookTitleSchema.min(1),
    description: NotebookTextSchema.default(''),
    priority: TaskPrioritySchema.default('med'),
    status: TaskStatusSchema.default('todo'),
    dueDate: CalendarDateSchema.nullable().optional(),
    startDate: CalendarDateSchema.nullable()
      .optional()
      .describe('Day the task shows on Today; omitted or null means now'),
    someday: z.boolean().optional(),
    noteId: UlidSchema.nullable().optional(),
    tags: NotebookTagsSchema.default([]),
  })
  .superRefine(rejectDatedSomeday);

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

/**
 * `version` may come from `If-Match` instead; one of the two is required.
 * `someday: true` clears startDate; a non-null startDate clears someday.
 */
export const UpdateTaskRequestSchema = z
  .object({
    version: VersionSchema.optional(),
    area: NotebookAreaSchema.optional(),
    title: NotebookTitleSchema.min(1).optional(),
    description: NotebookTextSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    status: TaskStatusSchema.optional(),
    dueDate: CalendarDateSchema.nullable().optional(),
    startDate: CalendarDateSchema.nullable().optional(),
    someday: z.boolean().optional(),
    noteId: UlidSchema.nullable().optional(),
    tags: NotebookTagsSchema.optional(),
  })
  .superRefine(rejectDatedSomeday);

export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

export const ListTasksQuerySchema = z
  .object({
    area: NotebookAreaSchema.optional(),
    status: TaskStatusSchema.optional(),
    priority: TaskPrioritySchema.optional(),
    dueOn: CalendarDateSchema.optional().describe('Tasks due on this date'),
    dueBefore: CalendarDateSchema.optional().describe(
      'Tasks due strictly before this date',
    ),
    startOn: CalendarDateSchema.optional().describe(
      'Tasks whose startDate is this date',
    ),
    startOnOrBefore: CalendarDateSchema.optional().describe(
      'Tasks that show on this day: startDate on or before it, or null; never someday',
    ),
    startAfter: CalendarDateSchema.optional().describe(
      'Tasks whose startDate is after this date (Upcoming); never someday',
    ),
    startBefore: CalendarDateSchema.optional().describe(
      "Tasks whose startDate is before this date; never someday or undated. With startAfter, a window (Today's Coming up)",
    ),
    someday: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional()
      .describe('Only someday tasks (true) or only scheduled tasks (false)'),
    noteId: z.string().min(1).optional().describe('Tasks linked to a note'),
    open: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional()
      .describe(
        'Only todo and in_progress tasks; done and dropped are closed (ignored when status is set)',
      ),
    today: CalendarDateSchema.optional().describe(
      "Caller's local day (yyyy-mm-dd) for carried-over ranking; defaults to UTC today",
    ),
    cursor: z.string().min(1).optional(),
    limit: PageLimitSchema.optional().describe(
      `Page size (1-100; default ${NOTEBOOK_PAGE_SIZE})`,
    ),
  })
  .superRefine((query, ctx) => {
    const ranges = [
      query.startOn,
      query.startOnOrBefore,
      query.startAfter ?? query.startBefore,
    ].filter((v) => v !== undefined);
    if (ranges.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use one of startOn, startOnOrBefore, startAfter/startBefore',
        path: ['startOn'],
      });
    }
    if (query.someday === true && ranges.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Someday tasks have no startDate',
        path: ['someday'],
      });
    }
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
  date: z
    .string()
    .optional()
    .describe("A daily note's day (yyyy-mm-dd); absent for pages and tasks"),
  status: TaskStatusSchema.optional().describe('Task hits: the task status'),
  version: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Task hits: the task version, for completing it from the hit'),
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
    version: VersionSchema,
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
  limit: PageLimitSchema.optional().describe(
    `Page size (1-100; default ${SYNC_DEFAULT_PAGE_LIMIT})`,
  ),
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
