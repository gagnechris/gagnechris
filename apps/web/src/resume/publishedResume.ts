import {
  RESUME_PDF_PATH,
  RESUME_UNAVAILABLE_TEXT,
  type ResumeIntro,
} from '@gagnechris/shared/render';
import { pageTitle } from '@gagnechris/shared';
import {
  fetchPrerender,
  fromPrerender,
  prerenderedHead,
  type PrerenderedHead,
} from '../prerender/documentPrerender';
import { publishedSiteUrl } from '../prerender/publishedSiteUrl';

export type ResumeView = ResumeIntro & {
  /** The sections as the published page printed them. */
  body: { html: string };
  head: PrerenderedHead;
  /** True when the publisher wrote the unpublish placeholder. */
  unavailable?: boolean;
};

export const publishedResumeUrl = (): string => publishedSiteUrl('/resume/');

export const unavailableResumeView = (): ResumeView => ({
  headline: null,
  summary: RESUME_UNAVAILABLE_TEXT,
  pdfPath: null,
  body: { html: '' },
  head: { title: pageTitle('Resume') },
  unavailable: true,
});

export function resumeViewFromDocument(root: ParentNode): ResumeView | null {
  if (root.querySelector('.resume-page-unavailable')) {
    return {
      ...unavailableResumeView(),
      head: prerenderedHead(root, pageTitle('Resume')),
    };
  }

  const page = root.querySelector('.resume-page-prerender');
  const summary = page?.querySelector('.resume-intro__summary');
  const body = page?.querySelector('.resume-body');
  if (!page || !summary || !body) return null;

  return {
    headline:
      page.querySelector('.resume-intro__headline')?.textContent || null,
    summary: summary.textContent ?? '',
    pdfPath:
      page.querySelector('.resume-download')?.getAttribute('href') ||
      RESUME_PDF_PATH,
    body: { html: body.innerHTML },
    head: prerenderedHead(root, pageTitle('Resume')),
  };
}

export const documentResumeView = (): ResumeView | null =>
  fromPrerender(resumeViewFromDocument);

export const loadPublishedResume = (): Promise<ResumeView | null> =>
  fetchPrerender(publishedResumeUrl(), resumeViewFromDocument);
