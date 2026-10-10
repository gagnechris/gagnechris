import { renderPostMarkdownToHtml } from './markdown.js';
import { readingMinutes } from './post-reading.js';
import type { PostProjectLink } from './projects.js';
import type { Post } from './schemas.js';

/** What a post page prints, and what the app reads back from it. */
export type PostArticleView = {
  slug: string;
  title: string;
  /** ISO date or `YYYY-MM-DD`, whichever the page carries. */
  date: string;
  excerpt: string;
  minutes: number;
  partOf: PostProjectLink[];
  /** Sanitised by `renderPostMarkdownToHtml`. */
  contentHtml: string;
};

export type PostArticleFields = Pick<
  Post,
  'slug' | 'title' | 'excerpt' | 'publishedAt' | 'bodyMarkdown'
>;

export const postArticleView = (
  post: PostArticleFields,
  partOf: readonly PostProjectLink[] = [],
): PostArticleView => ({
  slug: post.slug,
  title: post.title,
  date: post.publishedAt ?? '',
  excerpt: post.excerpt,
  minutes: readingMinutes(post.bodyMarkdown),
  partOf: [...partOf],
  contentHtml: renderPostMarkdownToHtml(post.bodyMarkdown),
});
