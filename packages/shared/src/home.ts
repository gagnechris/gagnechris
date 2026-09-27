/**
 * Zod-free entry point (`@gagnechris/shared/home`) so the public web bundle
 * can render home HTML without pulling zod / zod-to-openapi in.
 */
export { DEFAULT_HOME } from './home-default.js';
export {
  homeAboutExcerpt,
  HOME_PROFILE_IMAGE_SRC,
  renderHomeAboutHtml,
  renderHomeAboutSectionHtml,
  renderHomeFooterHtml,
  renderHomePrerenderHtml,
  renderHomeQuickLinksHtml,
} from './home-html.js';
export type { Home } from './schemas.js';
