import { escapeHtml } from './html.js';
import { renderPostMarkdownToHtml } from './markdown.js';
import { formatPostDate, postDateAttribute } from './post-date.js';
import {
  POST_AUTHOR_NOTE,
  POST_META_SEPARATOR,
  readingMinutes,
  readingTimeLabel,
} from './post-reading.js';
import type { Post } from './schemas.js';

export const POSTS_INDEX_EMPTY_TEXT = 'No posts yet. Check back soon!';

const postDateHtml = (iso: string | null | undefined): string => {
  const label = formatPostDate(iso);
  if (!label) return '';
  const attr = postDateAttribute(iso);
  const dateTime = attr ? ` datetime="${escapeHtml(attr)}"` : '';
  return `<time class="post-date"${dateTime}>${escapeHtml(label)}</time>`;
};

const authorNoteHtml = (): string => {
  const { name, role, about, rss } = POST_AUTHOR_NOTE;
  return (
    `<aside class="post-author" aria-label="About the author"><p>` +
    `<strong>${escapeHtml(name)}</strong> ${escapeHtml(role)} ` +
    `<a href="${about.href}">${escapeHtml(about.label)}</a>, or follow along via ` +
    `<a href="${rss.href}">${escapeHtml(rss.label)}</a>.` +
    `</p></aside>`
  );
};

/**
 * `apps/web/src/posts/PostArticle.tsx` renders the same markup byte for byte
 * (PostArticle.test.tsx). `blog-post-prerender` and `data-minutes` are what
 * the SPA parses on a cold load.
 */
export const renderPostPageBodyHtml = (
  post: Pick<
    Post,
    'slug' | 'title' | 'excerpt' | 'publishedAt' | 'bodyMarkdown'
  >,
): string => {
  const minutes = readingMinutes(post.bodyMarkdown);
  const date = postDateHtml(post.publishedAt);
  return (
    `<div class="post-page">` +
    `<article class="blog-post-prerender" data-slug="${escapeHtml(post.slug)}">` +
    `<header class="post-header">` +
    `<p class="post-meta">${date}${date ? POST_META_SEPARATOR : ''}` +
    `<span class="post-reading-time" data-minutes="${minutes}">${readingTimeLabel(minutes)}</span></p>` +
    `<h1>${escapeHtml(post.title)}</h1>` +
    (post.excerpt
      ? `<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>`
      : '') +
    `</header>` +
    `<div class="post-content blog-post-body">${renderPostMarkdownToHtml(post.bodyMarkdown)}</div>` +
    `</article>` +
    authorNoteHtml() +
    `</div>`
  );
};

export type PostsIndexItem = Pick<
  Post,
  'id' | 'slug' | 'title' | 'excerpt' | 'publishedAt'
>;

/** Classes match `apps/web/src/pages/PostsIndex.css`; `blog-index-prerender` is the marker the SPA parses. */
export const renderPostsIndexBodyHtml = (
  posts: readonly PostsIndexItem[],
): string => {
  const list = posts
    .map(
      (post) =>
        `<article class="post-preview" data-id="${escapeHtml(post.id)}">` +
        `<a class="post-preview__link" href="/posts/${escapeHtml(post.slug)}">` +
        `<h2>${escapeHtml(post.title)}</h2>` +
        postDateHtml(post.publishedAt) +
        (post.excerpt
          ? `<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>`
          : '') +
        `<span class="read-more">Read more →</span>` +
        `</a></article>`,
    )
    .join('');
  const main = list
    ? `<div class="posts-list">${list}</div>`
    : `<p>${POSTS_INDEX_EMPTY_TEXT}</p>`;
  return (
    `<div class="posts-index blog-index-prerender">` +
    `<header><h1>Posts</h1></header>` +
    `<main>${main}</main>` +
    `</div>`
  );
};
