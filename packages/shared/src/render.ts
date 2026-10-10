/** Not for mobile. */
export { DEFAULT_HOME } from './home-default.js';
export { DEFAULT_RESUME } from './resume-default.js';
export {
  renderMarkdownToHtml,
  renderPostMarkdownToHtml,
  renderProjectMarkdownToHtml,
  sanitizeRenderedHtml,
} from './markdown.js';
export {
  escapeHtml,
  escapeRegExp,
  replaceMeta,
  upsertCanonical,
  upsertMeta,
} from './html.js';
export { applyPageMeta, type PageMetaInput } from './page-meta-html.js';
export { pageTitle } from './site-config.js';
export {
  HOME_ALL_POSTS_LABEL,
  HOME_ALL_PROJECTS_LABEL,
  HOME_LINKS_SENTENCE,
  HOME_PROJECTS_HEADING,
  HOME_PROJECTS_HEADING_ID,
  HOME_RECENT_POSTS_HEADING,
  HOME_RECENT_POSTS_HEADING_ID,
  HOME_RECENT_POSTS_LIMIT,
  homeAboutExcerpt,
  homePostHref,
  renderHomeAboutHtml,
  selectHomeRecentPosts,
  type HomeLink,
  type HomeLinksSegment,
  type HomeRecentPost,
} from './home-html.js';
export {
  postArticleView,
  type PostArticleFields,
  type PostArticleView,
} from './post-html.js';
export {
  RESUME_ACTION_LINKS,
  RESUME_DOWNLOAD_FILENAME,
  RESUME_DOWNLOAD_ICON_PATH,
  RESUME_DOWNLOAD_LABEL,
  RESUME_PAGE_TITLE,
  RESUME_UNAVAILABLE_TEXT,
  resumeIntro,
  resumeSummaryExcerpt,
  type ResumeActionLink,
  type ResumeIntro,
} from './resume-html.js';
export {
  SITE_FOOTER_LINKS,
  SITE_HEADER_PHOTO_SIZE,
  SITE_NAV_LINKS,
  siteFooterCopy,
  siteNavCurrent,
  type SiteFooterLink,
  type SiteNavHref,
} from './site-chrome.js';
export type {
  Home,
  Resume,
  ResumeContent,
  ResumeEducation,
  ResumeExperience,
} from './schemas.js';
export {
  PROJECTS_INDEX_TITLE,
  projectPageView,
  type ProjectsIndexItem,
} from './project-html.js';
