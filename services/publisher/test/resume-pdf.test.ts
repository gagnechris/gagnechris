import { describe, expect, it } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import { renderResumePdf, RESUME_PDF_PUBLIC_PATH } from '../src/resume-pdf.js';

describe('renderResumePdf', () => {
  it('emits a non-empty PDF with the %PDF header', async () => {
    const bytes = await renderResumePdf({
      ...DEFAULT_RESUME,
      pdfPath: RESUME_PDF_PUBLIC_PATH,
      status: 'published',
      publishedAt: '2026-09-27T00:00:00.000Z',
      version: 1,
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const header = Buffer.from(bytes.subarray(0, 5)).toString('utf8');
    expect(header).toBe('%PDF-');
  });

  it('produces a multi-kilobyte PDF for the default resume', async () => {
    const bytes = await renderResumePdf({
      ...DEFAULT_RESUME,
      name: 'Chris Gagne',
      pdfPath: RESUME_PDF_PUBLIC_PATH,
      status: 'published',
      publishedAt: '2026-09-27T00:00:00.000Z',
      version: 1,
    });
    // Content is Flate-compressed; assert size scales with the long default copy.
    expect(bytes.byteLength).toBeGreaterThan(5000);
  });
});
