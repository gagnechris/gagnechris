import {
  DEFAULT_RESUME,
  RESUME_UNAVAILABLE_TEXT,
  renderResumeSectionsHtml,
  resumeIntro,
  type ResumeIntro,
} from '@gagnechris/shared/render';
import { pageTitle } from '@gagnechris/shared';
import {
  fetchPrerender,
  fromPrerender,
  prerenderedTitle,
} from '../prerender/documentPrerender';
import { publishedSiteUrl } from '../prerender/publishedSiteUrl';

export type ResumeView = ResumeIntro & {
  bodyHtml: string;
  headTitle: string;
  /** True when the publisher wrote the unpublish placeholder. */
  unavailable?: boolean;
};

export const publishedResumeUrl = (): string => publishedSiteUrl('/resume/');

/** Only when the published page can't be loaded; never painted before it. */
export const fallbackResumeView = (): ResumeView => ({
  ...resumeIntro(DEFAULT_RESUME),
  bodyHtml: renderResumeSectionsHtml(DEFAULT_RESUME.content),
  headTitle: pageTitle('Resume'),
});

export const unavailableResumeView = (): ResumeView => ({
  headline: null,
  summary: RESUME_UNAVAILABLE_TEXT,
  pdfPath: null,
  bodyHtml: '',
  headTitle: pageTitle('Resume'),
  unavailable: true,
});

export function resumeViewFromDocument(root: ParentNode): ResumeView | null {
  if (root.querySelector('.resume-page-unavailable')) {
    return unavailableResumeView();
  }

  const page = root.querySelector('.resume-page-prerender');
  const summary = page?.querySelector('.resume-intro__summary');
  const body = page?.querySelector('main.resume-body');
  if (!page || !summary || !body) return null;

  return {
    headline:
      page.querySelector('.resume-intro__headline')?.textContent || null,
    summary: summary.textContent ?? '',
    pdfPath:
      page.querySelector('.resume-download')?.getAttribute('href') ||
      DEFAULT_RESUME.pdfPath,
    bodyHtml: body.innerHTML,
    headTitle: prerenderedTitle(root) ?? pageTitle('Resume'),
  };
}

export const documentResumeView = (): ResumeView | null =>
  fromPrerender(resumeViewFromDocument);

export const loadPublishedResume = (): Promise<ResumeView | null> =>
  fetchPrerender(publishedResumeUrl(), resumeViewFromDocument);
