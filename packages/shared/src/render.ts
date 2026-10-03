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
  HOME_FOOTER_LINKS,
  HOME_PROFILE_IMAGE_SRC,
  HOME_QUICK_LINKS,
  renderHomeAboutHtml,
  renderHomeAboutSectionHtml,
  renderHomeFooterHtml,
  renderHomePrerenderHtml,
  renderHomeQuickLinksHtml,
  type SiteChromeLink,
} from './home-html.js';
export {
  renderResumePrerenderHtml,
  renderResumeSectionsHtml,
  resumeSummaryExcerpt,
} from './resume-html.js';
export type {
  Home,
  Resume,
  ResumeContent,
  ResumeEducation,
  ResumeExperience,
} from './schemas.js';
