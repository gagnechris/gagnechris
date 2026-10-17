/** Not for mobile. */
export { DEFAULT_HOME } from './home-default.js';
export { DEFAULT_RESUME } from './resume-default.js';
export {
  renderMarkdownToHtml,
  renderPostMarkdownToHtml,
  renderProjectMarkdownToHtml,
} from './markdown.js';
export { escapeHtml } from './html.js';
export { applyPageMeta } from './page-meta-html.js';
export { pageTitle, RESUME_PDF_PATH } from './site-config.js';
export {
  HOME_ALL_POSTS_LABEL,
  HOME_ALL_PROJECTS_LABEL,
  HOME_LINKS_SENTENCE,
  HOME_PROJECTS_HEADING,
  HOME_PROJECTS_HEADING_ID,
  HOME_RECENT_POSTS_HEADING,
  HOME_RECENT_POSTS_HEADING_ID,
  homeAboutExcerpt,
  homePostHref,
  renderHomeAboutHtml,
  selectHomeRecentPosts,
  type HomeLink,
  type HomeRecentPost,
} from './home-page.js';
export {
  postArticleView,
  type PostArticleFields,
  type PostArticleView,
} from './post-page.js';
export {
  RESUME_ACTION_LINKS,
  RESUME_DOWNLOAD_FILENAME,
  RESUME_DOWNLOAD_ICON_PATH,
  RESUME_DOWNLOAD_LABEL,
  RESUME_PAGE_TITLE,
  RESUME_UNAVAILABLE_TEXT,
  resumeIntro,
  resumeSummaryExcerpt,
  type ResumeIntro,
} from './resume-page.js';
export type { Home, Resume } from './schemas.js';
export { projectPageView, type ProjectsIndexItem } from './project-page.js';
