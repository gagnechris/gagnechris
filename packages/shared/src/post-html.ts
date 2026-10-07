import { escapeHtml } from './html.js';
import { renderPostMarkdownToHtml } from './markdown.js';
import { formatPostDate, postDateAttribute } from './post-date.js';
import {
  POST_AUTHOR_NOTE,
  POST_META_SEPARATOR,
  readingMinutes,
  readingTimeLabel,
} from './post-reading.js';
import {
  POST_PART_OF_LABEL,
  postPartOfSeparator,
  postPartOfSuffix,
  type PostProjectLink,
} from './projects.js';
import type { Post } from './schemas.js';

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
    `<section class="post-author" aria-label="About the author"><p>` +
    `<strong>${escapeHtml(name)}</strong> ${escapeHtml(role)} ` +
    `<a href="${about.href}">${escapeHtml(about.label)}</a>, or follow along via ` +
    `<a href="${rss.href}">${escapeHtml(rss.label)}</a>.` +
    `</p></section>`
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

type PostArticleFields = Pick<
  Post,
  'slug' | 'title' | 'excerpt' | 'publishedAt' | 'bodyMarkdown'
>;

/** The title is `<h1>` on the post page; embeds pass the level that fits where they sit. */
export const renderPostArticleHtml = (
  post: PostArticleFields,
  partOf: readonly PostProjectLink[] = [],
  headingLevel: 1 | 2 | 3 | 4 = 1,
): string => {
  const minutes = readingMinutes(post.bodyMarkdown);
  const date = postDateHtml(post.publishedAt);
  return (
    `<article class="blog-post-prerender" data-slug="${escapeHtml(post.slug)}">` +
    `<header class="post-header">` +
    `<p class="post-meta">${date}${date ? POST_META_SEPARATOR : ''}` +
    `<span class="post-reading-time" data-minutes="${minutes}">${readingTimeLabel(minutes)}</span></p>` +
    `<h${headingLevel}>${escapeHtml(post.title)}</h${headingLevel}>` +
    (post.excerpt
      ? `<p class="post-excerpt">${escapeHtml(post.excerpt)}</p>`
      : '') +
    partOfHtml(partOf) +
    `</header>` +
    `<div class="post-content blog-post-body">${renderPostMarkdownToHtml(post.bodyMarkdown)}</div>` +
    `</article>`
  );
};

/**
 * `apps/web/src/posts/PostArticle.tsx` renders the same markup byte for byte
 * (PostArticle.test.tsx). `blog-post-prerender` and `data-minutes` are what
 * the SPA parses on a cold load.
 */
export const renderPostPageBodyHtml = (
  post: PostArticleFields,
  partOf: readonly PostProjectLink[] = [],
): string =>
  `<main class="post-page">` +
  renderPostArticleHtml(post, partOf) +
  authorNoteHtml() +
  `</main>`;
