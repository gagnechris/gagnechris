import { describe, expect, it } from 'vitest';
import { DEFAULT_RESUME, planResumeDateMigration } from '@gagnechris/shared';
import { legacyResumeContent } from '@gagnechris/shared/fixtures/legacy-resume';
import { renderResumePage } from '../src/render.js';
import {
  buildResumePdfArtifact,
  renderResumePdf,
  sanitizeResumePdfText,
  RESUME_PDF_PUBLIC_PATH,
} from '../src/resume-pdf.js';

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

describe('buildResumePdfArtifact', () => {
  it('returns the PDF artifact when generation succeeds', async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const result = await buildResumePdfArtifact(
      publishedResume,
      async () => pdf,
    );
    expect(result).toEqual({
      ok: true,
      artifact: {
        key: 'resume.pdf',
        body: pdf,
        contentType: 'application/pdf',
        cacheControl: 'public,max-age=0,must-revalidate',
        contentDisposition: 'attachment; filename="Chris-Gagne-Resume.pdf"',
      },
    });
  });

  it('returns ok:false when generation throws', async () => {
    const result = await buildResumePdfArtifact(publishedResume, async () => {
      throw new Error('forced PDF failure');
    });
    expect(result).toEqual({ ok: false });
  });
});

describe('resume migration keeps the published artifacts', () => {
  const legacy = { ...publishedResume, content: legacyResumeContent() };
  const migrated = {
    ...legacy,
    content: planResumeDateMigration(legacy.content).content,
  };

  it('migrated content changes the stored shape', () => {
    expect(migrated.content.experience[0]).toMatchObject({
      company: 'Ro',
      start: '2019-07',
      end: null,
    });
  });

  it('the PDF is byte-identical for the old and migrated shapes', async () => {
    const [before, after] = await Promise.all([
      renderResumePdf(legacy),
      renderResumePdf(migrated),
    ]);
    expect(Buffer.from(after).equals(Buffer.from(before))).toBe(true);
  });

  it('the resume page HTML is identical for the old and migrated shapes', () => {
    const shell =
      '<!doctype html><html><head></head><body><div id="root"></div></body></html>';
    expect(renderResumePage(shell, migrated)).toBe(
      renderResumePage(shell, legacy),
    );
  });
});
