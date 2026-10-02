import { Logger } from '@aws-lambda-powertools/logger';
import { PUBLISHER_SERVICE_NAME } from '@gagnechris/shared';
import { renderResumePage, renderResumeUnavailablePage } from '../../render.js';
import {
  renderResumePdf,
  RESUME_PDF_CONTENT_DISPOSITION,
  RESUME_PDF_KEY,
} from '../../resume-pdf.js';
import type { PublishArtifact, PublishTarget } from '../types.js';
import { CACHE_HTML } from '../types.js';

const logger = new Logger({ serviceName: PUBLISHER_SERVICE_NAME });

const target: PublishTarget = {
  id: 'resume',
  matches(scope) {
    return scope.resume;
  },
  needsCatalog() {
    return false;
  },
  needsShell() {
    return true;
  },
  async run(ctx) {
    const { shell, sources } = ctx;
    const resume = await sources.getPublishedResume();
    if (resume) {
      const artifacts: PublishArtifact[] = [
        {
          key: 'resume/index.html',
          body: renderResumePage(shell, resume),
          contentType: 'text/html; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
      ];
      let resumePdfFailed = false;
      try {
        const pdfBytes = await renderResumePdf(resume);
        artifacts.push({
          key: RESUME_PDF_KEY,
          body: pdfBytes,
          contentType: 'application/pdf',
          cacheControl: CACHE_HTML,
          contentDisposition: RESUME_PDF_CONTENT_DISPOSITION,
        });
      } catch (error) {
        logger.error(
          'Resume PDF generation failed; keeping previous resume.pdf',
          { error },
        );
        resumePdfFailed = true;
      }
      return {
        artifacts,
        invalidationPaths: ['/resume*'],
        resumePublished: true,
        resumePdfFailed,
      };
    }
    return {
      artifacts: [
        {
          key: 'resume/index.html',
          body: renderResumeUnavailablePage(shell),
          contentType: 'text/html; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
      ],
      deleteKeys: [RESUME_PDF_KEY],
      invalidationPaths: ['/resume*'],
      resumeUnpublished: true,
    };
  },
};

export default target;
