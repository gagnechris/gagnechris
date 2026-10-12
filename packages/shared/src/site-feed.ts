import { readingMinutes } from './post-reading.js';
import type { PostProjectLink } from './projects.js';
import { resumeView, type ResumeView } from './resume-view.js';
import type { Home, Post, Resume } from './schemas.js';
import { RESUME_PDF_PATH } from './site-config.js';

/**
 * JSON the publisher writes beside the public pages, for the iOS app's Site
 * space. Paths are public URLs; posts live under the `blog/` S3 prefix.
 */
export const SITE_HOME_JSON_PATH = '/home/index.json';
export const SITE_RESUME_JSON_PATH = '/resume/index.json';
export const SITE_POSTS_JSON_PATH = '/posts/posts.json';

export const sitePostJsonPath = (slug: string): string =>
  `/posts/${slug}/index.json`;

export const SITE_HOME_JSON_KEY = 'home/index.json';
export const SITE_RESUME_JSON_KEY = 'resume/index.json';

export const sitePostJsonKey = (slug: string): string =>
  `blog/${slug}/index.json`;

export type SiteHomeJson = Pick<Home, 'name' | 'title' | 'about'>;

/** One `posts.json` item. */
export type SitePostListItem = Pick<
  Post,
  | 'id'
  | 'slug'
  | 'title'
  | 'excerpt'
  | 'publishedAt'
  | 'updatedAt'
  | 'tags'
  | 'coverImage'
>;

export type SitePostsJson = { items: SitePostListItem[] };

export type SitePostJson = Pick<
  Post,
  'slug' | 'title' | 'excerpt' | 'publishedAt' | 'bodyMarkdown'
> & { minutes: number; partOf: PostProjectLink[] };

export type SiteResumeJson =
  | { available: false }
  | {
      available: true;
      headline: string | null;
      summary: string;
      pdfPath: string;
      view: ResumeView;
    };

export const siteHomeJson = (home: SiteHomeJson): SiteHomeJson => ({
  name: home.name,
  title: home.title,
  about: home.about,
});

export const sitePostJson = (
  post: Pick<
    Post,
    'slug' | 'title' | 'excerpt' | 'publishedAt' | 'bodyMarkdown'
  >,
  partOf: readonly PostProjectLink[],
): SitePostJson => ({
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  publishedAt: post.publishedAt,
  minutes: readingMinutes(post.bodyMarkdown),
  partOf: [...partOf],
  bodyMarkdown: post.bodyMarkdown,
});

export const siteResumeJson = (
  resume: Pick<Resume, 'content'> | null,
): SiteResumeJson =>
  resume
    ? {
        available: true,
        headline: resume.content.headline?.trim() || null,
        summary: resume.content.summary,
        pdfPath: RESUME_PDF_PATH,
        view: resumeView(resume),
      }
    : { available: false };
