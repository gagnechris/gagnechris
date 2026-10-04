import { escapeHtml } from './html.js';
import { renderPostMarkdownToHtml } from './markdown.js';
import {
  formatPostDate,
  formatPostShortDate,
  postDateAttribute,
} from './post-date.js';
import {
  POST_AUTHOR_NOTE,
  POST_META_SEPARATOR,
  readingMinutes,
  readingTimeLabel,
} from './post-reading.js';
import {
  groupPostsByYear,
  POSTS_INDEX_EMPTY_TEXT,
  POSTS_INDEX_INTRO,
  POSTS_RSS_LINK,
  postsYearId,
} from './posts-index.js';
import {
  POST_PART_OF_LABEL,
  postPartOfSeparator,
  postPartOfSuffix,
  type PostProjectLink,
} from './projects.js';
import type { Post } from './schemas.js';

export { POSTS_INDEX_EMPTY_TEXT };

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

const partOfHtml = (links: readonly PostProjectLink[]): string =>
  links.length
    ? `<p class="post-part-of">${POST_PART_OF_LABEL} ` +
      links
        .map(
          ({ name, href }, i) =>
            postPartOfSeparator(i, links.length) +
            (href
              ? `<a class="post-part-of__project" href="${escapeHtml(href)}">${escapeHtml(name)}</a>`
              : `<span class="post-part-of__project">${escapeHtml(name)}</span>`),
        )
        .join('') +
      `${postPartOfSuffix(links.length)}</p>`
    : '';

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
  partOf: readonly PostProjectLink[] = [],
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
    partOfHtml(partOf) +
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

const postPreviewHtml = (post: PostsIndexItem): string => {
  const date = formatPostShortDate(post.publishedAt);
  const attr = postDateAttribute(post.publishedAt);
  return (
    `<li class="post-preview" data-id="${escapeHtml(post.id)}">` +
    `<a class="post-preview__link" href="/posts/${escapeHtml(post.slug)}">` +
    `<h3 class="post-preview__title">${escapeHtml(post.title)}</h3>` +
    (date
      ? `<time class="post-preview__date"${attr ? ` datetime="${attr}"` : ''}>${escapeHtml(date)}</time>`
      : '') +
    (post.excerpt
      ? `<p class="post-preview__excerpt">${escapeHtml(post.excerpt)}</p>`
      : '') +
    `</a></li>`
  );
};

/**
 * `apps/web/src/posts/PostsIndexBody.tsx` renders the same markup byte for
 * byte (PostsIndexBody.test.tsx); `blog-index-prerender` is the marker the
 * SPA parses on a cold load.
 */
export const renderPostsIndexBodyHtml = (
  posts: readonly PostsIndexItem[],
): string => {
  const groups = groupPostsByYear(posts);
  const main = groups.length
    ? groups
        .map(
          ({ year, posts: items }) =>
            `<section class="posts-year" aria-labelledby="${postsYearId(year)}">` +
            `<h2 class="posts-year__label" id="${postsYearId(year)}">${escapeHtml(year)}</h2>` +
            `<ul class="posts-year__list">${items.map(postPreviewHtml).join('')}</ul>` +
            `</section>`,
        )
        .join('')
    : `<p class="posts-index__empty">${POSTS_INDEX_EMPTY_TEXT}</p>`;
  return (
    `<div class="posts-index blog-index-prerender">` +
    `<header class="posts-index__header"><h1>Posts</h1>` +
    `<p class="posts-index__intro">${escapeHtml(POSTS_INDEX_INTRO)}</p>` +
    `<a class="posts-index__rss" href="${POSTS_RSS_LINK.href}">${escapeHtml(POSTS_RSS_LINK.label)}</a>` +
    `</header>` +
    `<main>${main}</main>` +
    `</div>`
  );
};
