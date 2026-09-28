import { z } from 'zod';
import { API_SERVICE_NAME } from './constants.js';

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
  currentVersion: z.number().int().optional(),
  current: z.unknown().optional(),
});

export type ConflictErrorResponse = z.infer<typeof ConflictErrorResponseSchema>;

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
  slug: z.string().min(1).optional(),
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
  slug: z.string().min(1).optional(),
  excerpt: z.string().optional(),
  bodyMarkdown: z.string().optional(),
  tags: z.array(z.string()).optional(),
  coverImage: z.string().nullable().optional(),
  seo: PostSeoSchema.nullable().optional(),
});

export type UpdatePostRequest = z.infer<typeof UpdatePostRequestSchema>;

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
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  message: z.string().trim().min(1).max(10_000),
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
