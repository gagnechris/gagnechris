/**
 * Zod-free entry point (`@gagnechris/shared/home`) so the public web bundle
 * can render home HTML without pulling zod / zod-to-openapi in.
 */
export { DEFAULT_HOME } from './home-default.js';
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
} from './home-html.js';
export type { SiteChromeLink } from './home-html.js';
export type { Home } from './schemas.js';
