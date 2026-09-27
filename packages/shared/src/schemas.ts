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
