import { textExcerpt } from './excerpt.js';
import { escapeHtml } from './html.js';
import type { Home } from './schemas.js';

/** Stable public URL (also used by the React home header). */
export const HOME_PROFILE_IMAGE_SRC = '/profile.jpg';

/**
 * Shared chrome link data for the home Quick Links + footer.
 * React renders these as JSX (`<Link>` / tracked `<a>`); the publisher
 * prerender renders the same list as HTML (CHR-125).
 */
export type SiteChromeLink = {
  label: string;
  href: string;
  /** `spa` → React Router; `external` → new tab; `href` → plain same-tab navigation. */
  kind: 'spa' | 'external' | 'href';
  /** GA4 event label (`click` / `external_link` / trackId). */
  trackId?: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
};

export const HOME_QUICK_LINKS: readonly SiteChromeLink[] = [
  { label: 'Resume', href: '/resume', kind: 'spa' },
  { label: 'Blog', href: '/blog', kind: 'spa' },
  { label: 'Contact', href: '/contact', kind: 'spa' },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/christophergagne/',
    kind: 'external',
    trackId: 'linkedin',
  },
  {
    label: 'GitHub',
    href: 'https://github.com/gagnechris',
    kind: 'external',
    trackId: 'github',
  },
];

export const HOME_FOOTER_LINKS: readonly SiteChromeLink[] = [
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/christophergagne/',
    kind: 'external',
    trackId: 'linkedin_footer',
  },
  {
    label: 'GitHub',
    href: 'https://github.com/gagnechris',
    kind: 'external',
    trackId: 'github_footer',
  },
  { label: 'RSS', href: '/rss.xml', kind: 'href' },
  {
    label: "🐻 Don't Feed the Bears",
    href: '/dont-feed-the-bears?from=footer',
    kind: 'spa',
    className: 'site-footer__bear',
    ariaLabel: "Don't Feed the Bears — Vermont camp mini-game",
    title: "Don't Feed the Bears",
  },
];

const renderChromeLinkHtml = (link: SiteChromeLink): string => {
  const label = escapeHtml(link.label);
  const href = escapeHtml(link.href);
  const classAttr = link.className
    ? ` class="${escapeHtml(link.className)}"`
    : '';
  const ariaAttr = link.ariaLabel
    ? ` aria-label="${escapeHtml(link.ariaLabel)}"`
    : '';
  const titleAttr = link.title ? ` title="${escapeHtml(link.title)}"` : '';
  if (link.kind === 'external') {
    return (
      `<a href="${href}" target="_blank" rel="noopener noreferrer"` +
      `${classAttr}${ariaAttr}${titleAttr}>${label}</a>`
    );
  }
  return `<a href="${href}"${classAttr}${ariaAttr}${titleAttr}>${label}</a>`;
};

/** Plain text → paragraphs; blank lines split, single newlines become breaks. */
export const renderHomeAboutHtml = (about: string): string =>
  about
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) => `<p>${escapeHtml(block).replace(/\n/g, () => '<br />')}</p>`,
    )
    .join('');

/** Section markup only — classes match `apps/web/src/App.css`. */
export const renderHomeAboutSectionHtml = (about: string): string =>
  `<section id="about"><h2>About Me</h2><div class="about-body">${renderHomeAboutHtml(about)}</div></section>`;

/** Quick Links section from {@link HOME_QUICK_LINKS} (CHR-125). */
export const renderHomeQuickLinksHtml = (): string =>
  `<section id="quick-links"><h2>Quick Links</h2><ul>` +
  HOME_QUICK_LINKS.map((link) => `<li>${renderChromeLinkHtml(link)}</li>`).join(
    '',
  ) +
  `</ul></section>`;

/**
 * Site footer for no-JS / crawlers. Year is fixed at publish time; the SPA
 * renders the live year from the same link list (CHR-125).
 */
export const renderHomeFooterHtml = (year = new Date().getFullYear()): string =>
  `<footer class="site-footer">` +
  `<p class="site-footer__copy">© ${year} Chris Gagne</p>` +
  `<ul class="site-footer__links">` +
  HOME_FOOTER_LINKS.map(
    (link) => `<li>${renderChromeLinkHtml(link)}</li>`,
  ).join('') +
  `</ul></footer>`;

/**
 * Full prerendered article the publisher injects into `index.html` and the SPA
 * reads back. Classes match React (`home-page` / `home-header`) so no-JS and
 * first paint look styled (CHR-116). `home-page-prerender` remains as a marker
 * for `publishedHome` hydration.
 */
export const renderHomePrerenderHtml = (home: Home): string => {
  const name = escapeHtml(home.name);
  const title = escapeHtml(home.title);
  const alt = escapeHtml(`Photo of ${home.name}`);
  return (
    `<article class="home-page home-page-prerender" data-name="${name}" data-title="${title}">` +
    `<header class="home-header">` +
    `<img src="${HOME_PROFILE_IMAGE_SRC}" class="profile" alt="${alt}" width="96" height="96" />` +
    `<h1>${name}</h1><p>${title}</p>` +
    `</header>` +
    `<main>${renderHomeAboutSectionHtml(home.about)}${renderHomeQuickLinksHtml()}</main>` +
    `${renderHomeFooterHtml()}` +
    `</article>`
  );
};

/** Meta-description fallback when `seo.description` is unset. */
export const homeAboutExcerpt = (about: string, max = 200): string =>
  textExcerpt(about, max);
