/**
 * Zod-free entry point (`@gagnechris/shared/resume`) so the public web bundle
 * can render resume HTML without pulling zod / zod-to-openapi in.
 */
export { DEFAULT_RESUME } from './resume-default.js';
export {
  renderResumePrerenderHtml,
  renderResumeSectionsHtml,
  resumeSummaryExcerpt,
} from './resume-html.js';
export type {
  Resume,
  ResumeContent,
  ResumeEducation,
  ResumeExperience,
} from './schemas.js';
