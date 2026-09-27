import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import {
  renderResumePdf,
  sanitizeResumePdfText,
  RESUME_PDF_PUBLIC_PATH,
} from '../src/resume-pdf.js';
import { publishResumePdf } from '../src/resume-pdf-publish.js';
import type { SiteStorage } from '../src/storage.js';

const publishedResume = {
  ...DEFAULT_RESUME,
  pdfPath: RESUME_PDF_PUBLIC_PATH,
  status: 'published' as const,
  publishedAt: '2026-09-27T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

describe('sanitizeResumePdfText', () => {
  it('keeps WinAnsi-breaking symbols that Inter supports', () => {
    const sample = 'Ship → prod ≥ 99% ✓ Łukasz − done';
    expect(sanitizeResumePdfText(sample)).toBe(sample);
  });

  it('replaces emoji Inter cannot draw', () => {
    expect(sanitizeResumePdfText('Hello 🙂 world')).toBe('Hello ? world');
  });
});

describe('renderResumePdf', () => {
  it('emits a non-empty PDF with the %PDF header', async () => {
    const bytes = await renderResumePdf(publishedResume);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const header = Buffer.from(bytes.subarray(0, 5)).toString('utf8');
    expect(header).toBe('%PDF-');
  });

  it('produces a multi-kilobyte PDF for the default resume', async () => {
    const bytes = await renderResumePdf({
      ...publishedResume,
      name: 'Chris Gagne',
    });
    // Subset Inter is larger than Helvetica streams; still assert meaningful size.
    expect(bytes.byteLength).toBeGreaterThan(5000);
  });

  it('renders non-WinAnsi symbols and a non-Latin name without throwing', async () => {
    const bytes = await renderResumePdf({
      ...publishedResume,
      name: 'Łukasz Nowak',
      content: {
        ...publishedResume.content,
        summary: 'Leadership → delivery ≥ expectations ✓ quality − waste 🙂',
        competencies: ['Polish Ł / Unicode − symbols'],
        experience: [
          {
            title: 'Staff Engineer',
            company: 'Example → Remote',
            bullets: ['Shipped ≥ 3 platforms ✓ on time − debt 🙂'],
          },
        ],
      },
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const header = Buffer.from(bytes.subarray(0, 5)).toString('utf8');
    expect(header).toBe('%PDF-');
  });
});

describe('publishResumePdf', () => {
  it('writes the PDF when generation succeeds', async () => {
    const put = vi.fn(async () => undefined);
    const storage = { put } as unknown as SiteStorage;
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const result = await publishResumePdf(
      storage,
      publishedResume,
      async () => pdf,
    );
    expect(result).toEqual({ status: 'written' });
    expect(put).toHaveBeenCalledWith(
      'resume.pdf',
      pdf,
      'application/pdf',
      'public,max-age=0,must-revalidate',
    );
  });

  it('keeps the previous PDF when generation throws', async () => {
    const put = vi.fn(async () => undefined);
    const storage = { put } as unknown as SiteStorage;
    const result = await publishResumePdf(
      storage,
      publishedResume,
      async () => {
        throw new Error('forced PDF failure');
      },
    );
    expect(result.status).toBe('kept-previous');
    if (result.status === 'kept-previous') {
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toBe('forced PDF failure');
    }
    expect(put).not.toHaveBeenCalled();
  });
});
