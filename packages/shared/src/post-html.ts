import { escapeHtml } from './html.js';
import { renderMarkdownToHtml } from './markdown.js';
import { formatPostDate, postDateAttribute } from './post-date.js';
import type { Post } from './schemas.js';

export const POSTS_INDEX_EMPTY_TEXT = 'No posts yet. Check back soon!';

const BACK_TO_POSTS = '← Back to Posts';

const postDateHtml = (iso: string | null | undefined): string => {
  const label = formatPostDate(iso);
  if (!label) return '';
  const attr = postDateAttribute(iso);
  const dateTime = attr ? ` datetime="${escapeHtml(attr)}"` : '';
  return `<time class="post-date"${dateTime}>${escapeHtml(label)}</time>`;
};

/** Classes match `apps/web/src/pages/PostPage.css`; `blog-post-prerender` is the marker the SPA parses. */
export const renderPostPageBodyHtml = (
  post: Pick<Post, 'slug' | 'title' | 'publishedAt' | 'bodyMarkdown'>,
): string =>
  `<div class="post-page">` +
  `<header><a class="back-link" href="/posts">${BACK_TO_POSTS}</a></header>` +
  `<article class="blog-post-prerender" data-slug="${escapeHtml(post.slug)}">` +
  `<h1>${escapeHtml(post.title)}</h1>` +
  postDateHtml(post.publishedAt) +
  `<div class="post-content blog-post-body">${renderMarkdownToHtml(post.bodyMarkdown)}</div>` +
  `</article>` +
  `<footer><a class="back-link-footer" href="/posts">${BACK_TO_POSTS}</a></footer>` +
  `</div>`;

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
