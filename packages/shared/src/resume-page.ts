import { textExcerpt } from './excerpt.js';
import type { Resume } from './schemas.js';
import { SITE_LINKEDIN_URL } from './site-config.js';

export const RESUME_PAGE_TITLE = 'Resume';
export const RESUME_UNAVAILABLE_TEXT = 'Resume available on request.';
export const RESUME_DOWNLOAD_LABEL = 'Download PDF';
export const RESUME_DOWNLOAD_FILENAME = 'Chris-Gagne-Resume.pdf';
export const RESUME_DOWNLOAD_ICON_PATH =
  'M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10';

export type ResumeActionLink = {
  label: string;
  href: string;
  kind: 'spa' | 'external';
  trackId?: string;
};

export const RESUME_ACTION_LINKS: readonly ResumeActionLink[] = [
  {
    label: 'LinkedIn',
    href: SITE_LINKEDIN_URL,
    kind: 'external',
    trackId: 'linkedin',
  },
  { label: 'Get in touch', href: '/contact', kind: 'spa' },
];

export type ResumeIntro = {
  headline: string | null;
  summary: string;
  /** Null hides Download PDF (unpublished resume). */
  pdfPath: string | null;
};

export const resumeIntro = (resume: Resume): ResumeIntro => ({
  headline: resume.content.headline?.trim() || null,
  summary: resume.content.summary,
  pdfPath: resume.pdfPath,
});

export const resumeSummaryExcerpt = (summary: string, max = 200): string =>
  textExcerpt(summary, max);
