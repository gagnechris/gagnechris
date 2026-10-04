import { textExcerpt } from './excerpt.js';
import { escapeHtml } from './html.js';
import { formatPostDate, postDateAttribute } from './post-date.js';
import type { Home, Post } from './schemas.js';
import {
  SITE_AUTHOR_NAME,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
} from './site-config.js';
import { renderSitePageHtml } from './site-chrome-html.js';

export { SITE_AUTHOR_NAME };

export type HomeLink = {
  label: string;
  href: string;
  /** `spa` → React Router; `external` → new tab. */
  kind: 'spa' | 'external';
  trackId?: string;
};

/** Plain strings are text; React and the prerender both walk this list. */
export type HomeLinksSegment = string | HomeLink;

export const HOME_LINKS_SENTENCE: readonly HomeLinksSegment[] = [
  'Read my ',
  { label: 'posts', href: '/posts', kind: 'spa' },
  ', see my ',
  { label: 'resume', href: '/resume', kind: 'spa' },
  ', or find me on ',
  {
    label: 'LinkedIn',
    href: SITE_LINKEDIN_URL,
    kind: 'external',
    trackId: 'linkedin',
  },
  ' and ',
  {
    label: 'GitHub',
    href: SITE_GITHUB_URL,
    kind: 'external',
    trackId: 'github',
  },
  '.',
];

export const HOME_RECENT_POSTS_LIMIT = 3;
export const HOME_RECENT_POSTS_HEADING = 'Recent posts';
export const HOME_RECENT_POSTS_HEADING_ID = 'home-recent-posts';
export const HOME_ALL_POSTS_LABEL = 'All posts';

export type HomeRecentPost = Pick<
  Post,
  'id' | 'slug' | 'title' | 'excerpt' | 'publishedAt'
>;

/** Same order as `posts.json`, so the publisher and the SPA pick the same posts. */
export const selectHomeRecentPosts = (
  posts: readonly (HomeRecentPost & Pick<Post, 'updatedAt'>)[],
): HomeRecentPost[] =>
  [...posts]
    .sort((a, b) =>
      (b.publishedAt ?? b.updatedAt).localeCompare(
        a.publishedAt ?? a.updatedAt,
      ),
    )
    .slice(0, HOME_RECENT_POSTS_LIMIT)
    .map(({ id, slug, title, excerpt, publishedAt }) => ({
      id,
      slug,
      title,
      excerpt,
      publishedAt,
    }));

export const homePostHref = (slug: string): string => `/posts/${slug}`;

const renderHomeLinkHtml = (link: HomeLink): string => {
  const label = escapeHtml(link.label);
  const href = escapeHtml(link.href);
  return link.kind === 'external'
    ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : `<a href="${href}">${label}</a>`;
};

export const renderHomeLinksSentenceHtml = (): string =>
  `<p class="home-hero__links">` +
  HOME_LINKS_SENTENCE.map((segment) =>
    typeof segment === 'string'
      ? escapeHtml(segment)
      : renderHomeLinkHtml(segment),
  ).join('') +
  `</p>`;

export const renderHomeAboutHtml = (about: string): string =>
  about
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) => `<p>${escapeHtml(block).replace(/\n/g, () => '<br />')}</p>`,
    )
    .join('');

const renderHomeRecentPostHtml = (post: HomeRecentPost): string => {
  const date = formatPostDate(post.publishedAt);
  const dateTime = postDateAttribute(post.publishedAt);
  return (
    `<li class="home-post" data-id="${escapeHtml(post.id)}">` +
    `<h3 class="home-post__title"><a href="${escapeHtml(homePostHref(post.slug))}">${escapeHtml(post.title)}</a></h3>` +
    (post.excerpt
      ? `<p class="home-post__excerpt">${escapeHtml(post.excerpt)}</p>`
      : '') +
    (date
      ? `<time class="home-post__date"${dateTime ? ` datetime="${escapeHtml(dateTime)}"` : ''}>${escapeHtml(date)}</time>`
      : '') +
    `</li>`
  );
};

/** Empty when there are no posts: the section has no empty state. */
export const renderHomeRecentPostsHtml = (
  posts: readonly HomeRecentPost[],
): string =>
  posts.length === 0
    ? ''
    : `<section class="home-section" aria-labelledby="${HOME_RECENT_POSTS_HEADING_ID}">` +
      `<div class="home-section__head">` +
      `<h2 class="home-section__label" id="${HOME_RECENT_POSTS_HEADING_ID}">${HOME_RECENT_POSTS_HEADING}</h2>` +
      `<a class="home-section__more" href="/posts">${HOME_ALL_POSTS_LABEL}</a>` +
      `</div>` +
      `<ul class="home-posts">${posts.map(renderHomeRecentPostHtml).join('')}</ul>` +
      `</section>`;

/**
 * Classes match `apps/web/src/App.css`. `home-page-prerender` and the data
 * attributes are what the SPA parses back on a cold load; React renders the
 * same markup (App.test.tsx compares the two DOMs).
 */
export const renderHomeBodyHtml = (
  home: Home,
  recentPosts: readonly HomeRecentPost[] = [],
): string => {
  const name = escapeHtml(home.name);
  const title = escapeHtml(home.title);
  return (
    `<main class="home-page home-page-prerender" data-name="${name}" data-title="${title}">` +
    `<header class="home-hero">` +
    `<h1 class="home-hero__name">${name}</h1>` +
    `<p class="home-hero__title">${title}</p>` +
    `<div class="home-hero__about">${renderHomeAboutHtml(home.about)}</div>` +
    renderHomeLinksSentenceHtml() +
    `</header>` +
    renderHomeRecentPostsHtml(recentPosts) +
    `</main>`
  );
};

export const renderHomePrerenderHtml = (
  home: Home,
  recentPosts: readonly HomeRecentPost[] = [],
  year?: number,
): string =>
  renderSitePageHtml(null, renderHomeBodyHtml(home, recentPosts), year);

export const homeAboutExcerpt = (about: string, max = 200): string =>
  textExcerpt(about, max);
