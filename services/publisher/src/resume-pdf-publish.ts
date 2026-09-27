import { Logger } from '@aws-lambda-powertools/logger';
import type { Resume } from '@gagnechris/shared';
import {
  renderResumePdf,
  RESUME_PDF_CONTENT_DISPOSITION,
  RESUME_PDF_KEY,
} from './resume-pdf.js';
import type { SiteStorage } from './storage.js';

const logger = new Logger({ serviceName: 'gagnechris-publisher' });

const CACHE_HTML = 'public,max-age=0,must-revalidate';

export type ResumePdfPublishResult =
  | { status: 'written' }
  | { status: 'kept-previous'; error: unknown };

/**
 * Generate and upload resume.pdf. On failure, log and leave any existing PDF
 * in place so the rest of the site rebuild can continue.
 */
export async function publishResumePdf(
  storage: SiteStorage,
  resume: Resume,
  render: typeof renderResumePdf = renderResumePdf,
): Promise<ResumePdfPublishResult> {
  try {
    const pdfBytes = await render(resume);
    await storage.put(
      RESUME_PDF_KEY,
      pdfBytes,
      'application/pdf',
      CACHE_HTML,
      RESUME_PDF_CONTENT_DISPOSITION,
    );
    return { status: 'written' };
  } catch (error) {
    logger.error('Resume PDF generation failed; keeping previous resume.pdf', {
      error,
    });
    return { status: 'kept-previous', error };
  }
}
