import { renderResumePage, renderResumeUnavailablePage } from '../../render.js';
import { publishResumePdf } from '../../resume-pdf-publish.js';
import { RESUME_PDF_KEY } from '../../resume-pdf.js';
import type { PublishTarget } from '../types.js';
import { CACHE_HTML } from '../types.js';

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
    const { shell, storage, sources } = ctx;
    const resume = await sources.getPublishedResume();
    if (resume) {
      await storage.put(
        'resume/index.html',
        renderResumePage(shell, resume),
        'text/html; charset=utf-8',
        CACHE_HTML,
      );
      const pdfResult = await publishResumePdf(storage, resume);
      return {
        resumePublished: true,
        resumePdfFailed: pdfResult.status === 'kept-previous',
      };
    }
    await storage.put(
      'resume/index.html',
      renderResumeUnavailablePage(shell),
      'text/html; charset=utf-8',
      CACHE_HTML,
    );
    await storage.delete(RESUME_PDF_KEY);
    return { resumeUnpublished: true };
  },
};

export default target;
