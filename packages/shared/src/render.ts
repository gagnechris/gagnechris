/** Not for mobile. */
export { DEFAULT_HOME } from './home-default.js';
export { DEFAULT_RESUME } from './resume-default.js';
export { renderMarkdownToHtml, sanitizeRenderedHtml } from './markdown.js';
export {
  escapeHtml,
  escapeRegExp,
  replaceMeta,
  upsertCanonical,
  upsertMeta,
} from './html.js';
export {
  homeAboutExcerpt,
  HOME_QUICK_LINKS,
  renderHomeAboutHtml,
  renderHomeAboutSectionHtml,
  renderHomeBodyHtml,
  renderHomePrerenderHtml,
  renderHomeQuickLinksHtml,
  type SiteChromeLink,
} from './home-html.js';
export {
  POSTS_INDEX_EMPTY_TEXT,
  renderPostPageBodyHtml,
  renderPostsIndexBodyHtml,
  type PostsIndexItem,
} from './post-html.js';
export {
  RESUME_UNAVAILABLE_HTML,
  RESUME_UNAVAILABLE_NAME,
  renderResumeBodyHtml,
  renderResumePrerenderHtml,
  renderResumeSectionsHtml,
  renderResumeUnavailableBodyHtml,
  renderResumeUnavailablePrerenderHtml,
  resumeSummaryExcerpt,
} from './resume-html.js';
export {
  renderSiteFooterHtml,
  renderSiteHeaderHtml,
  renderSitePageHtml,
  SITE_FOOTER_LINKS,
  SITE_HEADER_PHOTO_SIZE,
  SITE_NAV_LINKS,
  siteFooterCopy,
  siteNavCurrent,
  type SiteFooterLink,
  type SiteNavHref,
} from './site-chrome-html.js';
export type {
  Home,
  Resume,
  ResumeContent,
  ResumeEducation,
  ResumeExperience,
} from './schemas.js';
