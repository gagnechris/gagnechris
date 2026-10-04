import {
  DEFAULT_RESUME,
  RESUME_UNAVAILABLE_HTML,
  RESUME_UNAVAILABLE_NAME,
  renderResumeSectionsHtml,
} from '@gagnechris/shared/render';
import { fetchPrerender, fromPrerender } from '../prerender/documentPrerender';

export type ResumeView = {
  name: string;
  pdfPath: string;
  bodyHtml: string;
  /** True when the publisher wrote the unpublish placeholder. */
  unavailable?: boolean;
};

/** Local Vite uses `/__site` → static origin; prod is same-origin. */
export function publishedResumeUrl(): string {
  const localSite = import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim();
  return localSite ? '/__site/resume/' : '/resume/';
}

/** Rendered from DEFAULT_RESUME so the page never blanks before first publish. */
export const fallbackResumeView = (): ResumeView => ({
  name: DEFAULT_RESUME.name,
  pdfPath: DEFAULT_RESUME.pdfPath,
  bodyHtml: renderResumeSectionsHtml(DEFAULT_RESUME.content),
});

export const unavailableResumeView = (): ResumeView => ({
  name: RESUME_UNAVAILABLE_NAME,
  pdfPath: '',
  bodyHtml: RESUME_UNAVAILABLE_HTML,
  unavailable: true,
});

export function resumeViewFromDocument(root: ParentNode): ResumeView | null {
  if (root.querySelector('.resume-page-unavailable')) {
    return unavailableResumeView();
  }

  const page = root.querySelector('.resume-page-prerender');
  const body = page?.querySelector('main');
  if (!page || !body) return null;

  return {
    name: page.getAttribute('data-name') || DEFAULT_RESUME.name,
    pdfPath: page.getAttribute('data-pdf') || DEFAULT_RESUME.pdfPath,
    bodyHtml: body.innerHTML,
  };
}

export const documentResumeView = (): ResumeView | null =>
  fromPrerender(resumeViewFromDocument);

export const loadPublishedResume = (): Promise<ResumeView | null> =>
  fetchPrerender(publishedResumeUrl(), resumeViewFromDocument);
