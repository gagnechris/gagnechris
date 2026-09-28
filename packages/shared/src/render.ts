/** HTML / markdown prerender helpers (web + publisher). Not for mobile. */
export { renderMarkdownToHtml } from './markdown.js';
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
