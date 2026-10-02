import { z } from 'zod';
import {
  PostSeoSchema,
  PostStatusSchema,
  ResumeContentSchema,
  type Home,
  type Post,
  type Resume,
} from '@gagnechris/shared';
import {
  EMPTY_SLUG_FALLBACK,
  slugify as sharedSlugify,
} from '@gagnechris/shared';
import { deepEqual } from './deep-equal.js';
import {
  HOME_ID,
  homeMetaSk,
  homePk,
  homePublishedSk,
  postMetaSk,
  postPk,
  postPublishedSk,
  RESUME_ID,
  resumeMetaSk,
  resumePk,
  resumePublishedSk,
  statusGsi1Pk,
  statusGsi1Sk,
} from './keys.js';

export function nowIso(): string {
  return new Date().toISOString();
}

/** Shared slugify with EMPTY_SLUG_FALLBACK when the title yields an empty slug. */
export function slugify(input: string): string {
  return sharedSlugify(input) || EMPTY_SLUG_FALLBACK;
}

/** Shared publishable META fields (status / publishedAt / updatedAt / version). */
export const PublishableMetaFieldsSchema = z.object({
  status: PostStatusSchema,
  publishedAt: z.string().nullable().optional(),
  updatedAt: z.string().min(1),
  /** Required (CHR-170). Missing-attribute writes still treated as 0 via VERSION_MATCH_CONDITION. */
  version: z.number().int().nonnegative(),
});

export const PostMetaItemSchema = PublishableMetaFieldsSchema.extend({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('post'),
  postId: z.string().min(1),
  slug: z.string().min(1),
  title: z.string(),
  excerpt: z.string(),
  bodyMarkdown: z.string(),
  tags: z.array(z.string()),
  coverImage: z.string().nullable().optional(),
  seo: PostSeoSchema.nullable().optional(),
  gsi1pk: z.string().min(1).optional(),
  gsi1sk: z.string().min(1).optional(),
});

export type PostMetaItem = z.infer<typeof PostMetaItemSchema>;

export const HomeMetaItemSchema = PublishableMetaFieldsSchema.extend({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('home'),
  homeId: z.string().min(1).default(HOME_ID),
  name: z.string().min(1),
  title: z.string(),
  about: z.string(),
  seo: PostSeoSchema.nullable().optional(),
});

export type HomeMetaItem = z.infer<typeof HomeMetaItemSchema>;

export const ResumeMetaItemSchema = PublishableMetaFieldsSchema.extend({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('resume'),
  resumeId: z.string().min(1).default(RESUME_ID),
  name: z.string().min(1),
  pdfPath: z.string().min(1),
  content: ResumeContentSchema,
  seo: PostSeoSchema.nullable().optional(),
});

export type ResumeMetaItem = z.infer<typeof ResumeMetaItemSchema>;

export const ContactEmailStatusSchema = z.enum(['pending', 'sent', 'failed']);
export type ContactEmailStatus = z.infer<typeof ContactEmailStatusSchema>;

export const ContactMsgItemSchema = z.object({
  pk: z.string().min(1),
  sk: z.string().min(1),
  entityType: z.literal('contact'),
  contactId: z.string().min(1),
  name: z.string(),
  email: z.string(),
  message: z.string(),
  sourceIp: z.string(),
  createdAt: z.string().min(1),
  emailStatus: ContactEmailStatusSchema,
  emailError: z.string().optional(),
});

export type ContactMsgItem = z.infer<typeof ContactMsgItemSchema>;

export function parsePostMetaItem(raw: unknown): PostMetaItem {
  return PostMetaItemSchema.parse(raw);
}

export function parseHomeMetaItem(raw: unknown): HomeMetaItem {
  return HomeMetaItemSchema.parse(raw);
}

export function parseResumeMetaItem(raw: unknown): ResumeMetaItem {
  return ResumeMetaItemSchema.parse(raw);
}

export function parseContactMsgItem(raw: unknown): ContactMsgItem {
  return ContactMsgItemSchema.parse(raw);
}

export function postContentEqual(
  a: Pick<
    Post,
    | 'slug'
    | 'title'
    | 'excerpt'
    | 'bodyMarkdown'
    | 'tags'
    | 'coverImage'
    | 'seo'
  >,
  b: Pick<
    Post,
    | 'slug'
    | 'title'
    | 'excerpt'
    | 'bodyMarkdown'
    | 'tags'
    | 'coverImage'
    | 'seo'
  >,
): boolean {
  return (
    a.slug === b.slug &&
    a.title === b.title &&
    a.excerpt === b.excerpt &&
    a.bodyMarkdown === b.bodyMarkdown &&
    deepEqual(a.tags, b.tags) &&
    a.coverImage === b.coverImage &&
    deepEqual(a.seo ?? null, b.seo ?? null)
  );
}

export function metaToPost(
  item: PostMetaItem,
  hasUnpublishedChanges = false,
): Post {
  return {
    id: item.postId,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    bodyMarkdown: item.bodyMarkdown,
    tags: item.tags,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    coverImage: item.coverImage ?? null,
    seo: item.seo ?? null,
    version: item.version,
    hasUnpublishedChanges,
  };
}

export function buildMetaItem(post: Post): PostMetaItem {
  const sortTs =
    post.status === 'published' && post.publishedAt
      ? post.publishedAt
      : post.updatedAt;
  return {
    pk: postPk(post.id),
    sk: postMetaSk(),
    entityType: 'post',
    postId: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    bodyMarkdown: post.bodyMarkdown,
    tags: post.tags,
    status: post.status,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    coverImage: post.coverImage,
    seo: post.seo,
    version: post.version,
    gsi1pk: statusGsi1Pk(post.status),
    gsi1sk: statusGsi1Sk(sortTs, post.id),
  };
}

/**
 * Live snapshot read by the publisher. Omits GSI1 keys so admin
 * `STATUS#published` queries only return draft META rows.
 */
export function buildPublishedItem(
  post: Post,
): Omit<PostMetaItem, 'gsi1pk' | 'gsi1sk'> {
  const publishedAt = post.publishedAt ?? post.updatedAt;
  const meta = buildMetaItem({ ...post, status: 'published', publishedAt });
  const { gsi1pk: _gsi1pk, gsi1sk: _gsi1sk, ...rest } = meta;
  return {
    ...rest,
    sk: postPublishedSk(),
    status: 'published',
    publishedAt,
  };
}

export function homeContentEqual(
  a: Pick<Home, 'name' | 'title' | 'about' | 'seo'>,
  b: Pick<Home, 'name' | 'title' | 'about' | 'seo'>,
): boolean {
  return (
    a.name === b.name &&
    a.title === b.title &&
    a.about === b.about &&
    deepEqual(a.seo ?? null, b.seo ?? null)
  );
}

export function metaToHome(
  item: HomeMetaItem,
  hasUnpublishedChanges = false,
): Home {
  return {
    name: item.name,
    title: item.title,
    about: item.about,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version,
    hasUnpublishedChanges,
  };
}

export function buildHomeMetaItem(home: Home): HomeMetaItem {
  return {
    pk: homePk(),
    sk: homeMetaSk(),
    entityType: 'home',
    homeId: HOME_ID,
    name: home.name,
    title: home.title,
    about: home.about,
    status: home.status,
    publishedAt: home.publishedAt,
    updatedAt: home.updatedAt,
    seo: home.seo,
    version: home.version,
  };
}

export function buildHomePublishedItem(home: Home): HomeMetaItem {
  return {
    ...buildHomeMetaItem(home),
    sk: homePublishedSk(),
    status: 'published',
  };
}

export function resumeContentEqual(
  a: Pick<Resume, 'name' | 'pdfPath' | 'content' | 'seo'>,
  b: Pick<Resume, 'name' | 'pdfPath' | 'content' | 'seo'>,
): boolean {
  return (
    a.name === b.name &&
    a.pdfPath === b.pdfPath &&
    deepEqual(a.content, b.content) &&
    deepEqual(a.seo ?? null, b.seo ?? null)
  );
}

export function metaToResume(
  item: ResumeMetaItem,
  hasUnpublishedChanges = false,
): Resume {
  return {
    name: item.name,
    pdfPath: item.pdfPath,
    content: item.content,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version,
    hasUnpublishedChanges,
  };
}

export function buildResumeMetaItem(resume: Resume): ResumeMetaItem {
  return {
    pk: resumePk(),
    sk: resumeMetaSk(),
    entityType: 'resume',
    resumeId: RESUME_ID,
    name: resume.name,
    pdfPath: resume.pdfPath,
    content: resume.content,
    status: resume.status,
    publishedAt: resume.publishedAt,
    updatedAt: resume.updatedAt,
    seo: resume.seo,
    version: resume.version,
  };
}

export function buildResumePublishedItem(resume: Resume): ResumeMetaItem {
  return {
    ...buildResumeMetaItem(resume),
    sk: resumePublishedSk(),
    status: 'published',
  };
}
