import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('gagnechris-api'),
  })
  .openapi('HealthResponse');

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const AdminMeResponseSchema = z
  .object({
    sub: z.string().min(1).openapi({ description: 'Cognito user sub' }),
    email: z
      .string()
      .email()
      .optional()
      .openapi({ description: 'Verified email when present' }),
    username: z
      .string()
      .optional()
      .openapi({ description: 'Cognito username claim' }),
  })
  .openapi('AdminMeResponse');

export type AdminMeResponse = z.infer<typeof AdminMeResponseSchema>;

export const ErrorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string().optional(),
  })
  .openapi('ErrorResponse');

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const PostStatusSchema = z
  .enum(['draft', 'published', 'deleted'])
  .openapi('PostStatus');

export type PostStatus = z.infer<typeof PostStatusSchema>;

export const PostSeoSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
  })
  .openapi('PostSeo');

export type PostSeo = z.infer<typeof PostSeoSchema>;

export const PostSchema = z
  .object({
    id: z.string().min(1).openapi({ description: 'Immutable post id (ULID)' }),
    slug: z.string().min(1),
    title: z.string(),
    excerpt: z.string(),
    bodyMarkdown: z.string(),
    tags: z.array(z.string()),
    status: PostStatusSchema,
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
    coverImage: z.string().nullable(),
    seo: PostSeoSchema.nullable(),
    version: z.number().int().nonnegative(),
    hasUnpublishedChanges: z.boolean().openapi({
      description:
        'True when a published snapshot exists and the editable draft differs from it',
    }),
  })
  .openapi('Post');

export type Post = z.infer<typeof PostSchema>;

export const PostListResponseSchema = z
  .object({
    items: z.array(PostSchema),
  })
  .openapi('PostListResponse');

export type PostListResponse = z.infer<typeof PostListResponseSchema>;

export const CreatePostRequestSchema = z
  .object({
    title: z.string().min(1).default('Untitled'),
    slug: z.string().min(1).optional(),
    excerpt: z.string().default(''),
    bodyMarkdown: z.string().default(''),
    tags: z.array(z.string()).default([]),
    coverImage: z.string().nullable().optional(),
    seo: PostSeoSchema.nullable().optional(),
  })
  .openapi('CreatePostRequest');

export type CreatePostRequest = z.infer<typeof CreatePostRequestSchema>;

export const UpdatePostRequestSchema = z
  .object({
    version: z
      .number()
      .int()
      .nonnegative()
      .openapi({ description: 'Expected version for optimistic concurrency' }),
    title: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    excerpt: z.string().optional(),
    bodyMarkdown: z.string().optional(),
    tags: z.array(z.string()).optional(),
    coverImage: z.string().nullable().optional(),
    seo: PostSeoSchema.nullable().optional(),
  })
  .openapi('UpdatePostRequest');

export type UpdatePostRequest = z.infer<typeof UpdatePostRequestSchema>;

/** Allowed Content-Type values for admin media uploads (CHR-31). */
export const MEDIA_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const MediaContentTypeSchema = z
  .enum(MEDIA_CONTENT_TYPES)
  .openapi('MediaContentType');

export type MediaContentType = z.infer<typeof MediaContentTypeSchema>;

/** Max upload size enforced via signed Content-Length (10 MiB). */
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export const MediaUploadUrlRequestSchema = z
  .object({
    contentType: MediaContentTypeSchema,
    contentLength: z
      .number()
      .int()
      .positive()
      .max(MEDIA_MAX_BYTES)
      .openapi({ description: 'Exact byte length of the PUT body (max 10 MiB)' }),
    filename: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .openapi({ description: 'Original filename (extension used when present)' }),
  })
  .openapi('MediaUploadUrlRequest');

export type MediaUploadUrlRequest = z.infer<typeof MediaUploadUrlRequestSchema>;

export const MediaUploadUrlResponseSchema = z
  .object({
    uploadUrl: z.string().url().openapi({
      description: 'Presigned PUT URL (or local API PUT URL in filesystem mode)',
    }),
    publicPath: z
      .string()
      .regex(/^\/media\//)
      .openapi({ description: 'Same-origin path to insert in markdown' }),
    headers: z
      .object({
        'Content-Type': z.string(),
      })
      .openapi({
        description:
          'Headers the client must send on the PUT (Content-Length is set by the browser to match contentLength)',
      }),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .openapi('MediaUploadUrlResponse');

export type MediaUploadUrlResponse = z.infer<
  typeof MediaUploadUrlResponseSchema
>;

export const ContactRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    message: z.string().trim().min(1).max(10_000),
    /**
     * Honeypot — must be empty. Non-semantic name resists autofill (CHR-98).
     * Legacy `website` still accepted so old bots keep triggering the trap.
     */
    hp_field: z.string().max(200).optional().default(''),
    website: z.string().max(200).optional().default(''),
    /** Client form-open time (ms since epoch). Used for min time-to-submit. */
    formStartedAt: z.number().int().nonnegative().optional(),
  })
  .openapi('ContactRequest');

export type ContactRequest = z.infer<typeof ContactRequestSchema>;

export const ContactResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .openapi('ContactResponse');

export type ContactResponse = z.infer<typeof ContactResponseSchema>;

export const HomeSchema = z
  .object({
    name: z.string().min(1).openapi({ description: 'Header name' }),
    title: z.string().openapi({
      description: 'Header subtitle, e.g. "Engineering Leader"',
    }),
    about: z.string().openapi({
      description: 'About Me body text; blank lines separate paragraphs',
    }),
    status: PostStatusSchema,
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
    seo: PostSeoSchema.nullable(),
    version: z.number().int().nonnegative(),
    hasUnpublishedChanges: z.boolean().openapi({
      description:
        'True when a published snapshot exists and the editable draft differs from it',
    }),
  })
  .openapi('Home');

export type Home = z.infer<typeof HomeSchema>;

export const UpdateHomeRequestSchema = z
  .object({
    version: z
      .number()
      .int()
      .nonnegative()
      .openapi({ description: 'Expected version for optimistic concurrency' }),
    name: z.string().min(1).optional(),
    title: z.string().optional(),
    about: z.string().optional(),
    seo: PostSeoSchema.nullable().optional(),
  })
  .openapi('UpdateHomeRequest');

export type UpdateHomeRequest = z.infer<typeof UpdateHomeRequestSchema>;

export const ResumeExperienceSchema = z
  .object({
    title: z.string(),
    company: z.string(),
    bullets: z.array(z.string()),
  })
  .openapi('ResumeExperience');

export type ResumeExperience = z.infer<typeof ResumeExperienceSchema>;

export const ResumeEducationSchema = z
  .object({
    title: z.string(),
    institution: z.string(),
    location: z.string(),
    year: z.string(),
    degreeDetail: z.string().optional(),
  })
  .openapi('ResumeEducation');

export type ResumeEducation = z.infer<typeof ResumeEducationSchema>;

export const ResumeContentSchema = z
  .object({
    summary: z.string(),
    competencies: z.array(z.string()).openapi({
      description: 'Flat list; the renderer splits it into two columns',
    }),
    experience: z.array(ResumeExperienceSchema),
    skills: z.array(z.string()),
    education: z.array(ResumeEducationSchema),
  })
  .openapi('ResumeContent');

export type ResumeContent = z.infer<typeof ResumeContentSchema>;

export const ResumeSchema = z
  .object({
    name: z.string().min(1),
    pdfPath: z.string().min(1).openapi({
      description:
        'Site-relative path to the downloadable PDF (publisher always serves /resume.pdf)',
    }),
    content: ResumeContentSchema,
    status: PostStatusSchema,
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
    seo: PostSeoSchema.nullable(),
    version: z.number().int().nonnegative(),
    hasUnpublishedChanges: z.boolean().openapi({
      description:
        'True when a published snapshot exists and the editable draft differs from it',
    }),
  })
  .openapi('Resume');

export type Resume = z.infer<typeof ResumeSchema>;

export const UpdateResumeRequestSchema = z
  .object({
    version: z
      .number()
      .int()
      .nonnegative()
      .openapi({ description: 'Expected version for optimistic concurrency' }),
    name: z.string().min(1).optional(),
    pdfPath: z.string().min(1).optional(),
    content: ResumeContentSchema.optional(),
    seo: PostSeoSchema.nullable().optional(),
  })
  .openapi('UpdateResumeRequest');

export type UpdateResumeRequest = z.infer<typeof UpdateResumeRequestSchema>;

export const ResumeDownloadNotifyRequestSchema = z
  .object({
    /** Optional client context (no PII required). */
    referrer: z.string().max(500).optional(),
  })
  .openapi('ResumeDownloadNotifyRequest');

export type ResumeDownloadNotifyRequest = z.infer<
  typeof ResumeDownloadNotifyRequestSchema
>;

export const ResumeDownloadNotifyResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .openapi('ResumeDownloadNotifyResponse');

export type ResumeDownloadNotifyResponse = z.infer<
  typeof ResumeDownloadNotifyResponseSchema
>;
