import fontkit from '@pdf-lib/fontkit';
import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
} from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_RESUME,
  planResumeDateMigration,
  resumeRoleDates,
  type Resume,
  type ResumeExperience,
} from '@gagnechris/shared';
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

// The live resume: DEFAULT_RESUME's content without a headline or an
// earlier-roles cut-off.
const {
  headline: _headline,
  earlierRolesThrough: _cutoff,
  ...liveContent
} = DEFAULT_RESUME.content;
const liveResume: Resume = { ...publishedResume, content: liveContent };

const pageCount = async (bytes: Uint8Array): Promise<number> =>
  (await PDFDocument.load(bytes)).getPageCount();

/** Extracted text in content order, whitespace collapsed. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    pages.push(
      content.items
        .map((item) =>
          'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '',
        )
        .join(''),
    );
  }
  await pdf.destroy();
  return pages.join('\n').replace(/\s+/g, ' ');
}

const roleLine = (item: ResumeExperience): string =>
  `${resumeRoleDates(item)} ${item.title} at ${item.company}`;

describe('resume PDF layout', () => {
  it.each([
    ['the live resume', liveResume],
    ['the default resume', publishedResume],
  ])('%s renders to exactly two Letter pages', async (_name, resume) => {
    const doc = await PDFDocument.load(await renderResumePdf(resume));
    expect(doc.getPageCount()).toBe(2);
    for (const page of doc.getPages()) {
      expect(page.getSize()).toEqual({ width: 612, height: 792 });
    }
  });

  it('drops the oldest ended roles to one line to stay on two pages', async () => {
    const experience = DEFAULT_RESUME.content.experience;
    const older: ResumeExperience[] = Array.from({ length: 6 }, (_, i) => ({
      title: `Engineer ${i + 1}`,
      company: `Older Company ${i + 1}`,
      start: `${1990 + i}-01`,
      end: `${1990 + i}-12`,
      bullets: [
        'Built and supported line-of-business applications for several internal teams across the company.',
        'Maintained the release process and the build tooling for every product the team shipped that year.',
      ],
    }));
    const resume: Resume = {
      ...liveResume,
      content: { ...liveContent, experience: [...experience, ...older] },
    };
    const bytes = await renderResumePdf(resume);
    expect(await pageCount(bytes)).toBe(2);
    const text = await pdfText(bytes);
    expect(text).toContain(roleLine(experience[0]!));
    expect(text).toContain(experience[0]!.bullets[0]);
    for (const item of older) {
      expect(text).toContain(roleLine(item));
      expect(text).not.toContain(item.bullets[0]);
    }
  });
});

describe('resume PDF text', () => {
  it('extracts sections in reading order with each date next to its role', async () => {
    const text = await pdfText(await renderResumePdf(liveResume));
    const at = (needle: string, from = 0): number => {
      const index = text.indexOf(needle, from);
      expect(index, needle).toBeGreaterThanOrEqual(from);
      return index;
    };
    let cursor = at('Chris Gagne');
    cursor = at('Director of Software Engineering at Ro', cursor);
    cursor = at(liveContent.summary, cursor);
    cursor = at('EXPERIENCE', cursor);
    let collapsed = false;
    for (const item of liveContent.experience) {
      cursor = at(roleLine(item), cursor);
      const expanded = text.includes(item.bullets[0]!);
      // Only the oldest roles may drop to one line.
      expect(expanded && collapsed, item.company).toBe(false);
      if (!expanded) {
        collapsed = true;
        continue;
      }
      for (const bullet of item.bullets) cursor = at(`• ${bullet}`, cursor);
    }
    expect(text).toContain(liveContent.experience[0]!.bullets[0]);
    cursor = at('STRENGTHS AND SKILLS', cursor);
    cursor = at(liveContent.competencies.join(' · '), cursor);
    cursor = at('Programming Languages Python, NodeJS', cursor);
    cursor = at('EDUCATION', cursor);
    for (const item of liveContent.education) {
      cursor = at(`${item.year} ${item.title}`, cursor);
    }
  });

  it('copies characters Newsreader lacks through the Inter fallback', async () => {
    const text = await pdfText(
      await renderResumePdf({
        ...liveResume,
        content: {
          ...liveContent,
          summary: 'Ship → prod ≥ 99% ✓ Łukasz 🙂 done',
        },
      }),
    );
    expect(text).toContain('Ship → prod ≥ 99% ✓ Łukasz ? done');
  });
});

describe('resume PDF fonts and size', () => {
  it('embeds subset Inter and Newsreader and stays under 300 KB', async () => {
    const bytes = await renderResumePdf(liveResume);
    expect(bytes.byteLength).toBeLessThan(300 * 1024);

    const doc = await PDFDocument.load(bytes);
    const embedded: { name: string; glyphs: number; full: number }[] = [];
    for (const [, object] of doc.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict)) continue;
      if (object.get(PDFName.of('Type')) !== PDFName.of('FontDescriptor')) {
        continue;
      }
      // pdf-lib names each embedded font `<PostScript name>-<n>`.
      const name = object
        .get(PDFName.of('FontName'))!
        .toString()
        .replace(/^\/|-\d+$/g, '');
      const file = doc.context.lookup(object.get(PDFName.of('FontFile2')));
      if (!(file instanceof PDFRawStream))
        throw new Error(`${name}: no font file`);
      const glyphs = fontkit.create(
        decodePDFRawStream(file).decode(),
      ).numGlyphs;
      const full = fontkit.create(
        readFileSync(new URL(`../assets/fonts/${name}.ttf`, import.meta.url)),
      ).numGlyphs;
      embedded.push({ name, glyphs, full });
    }
    expect(embedded.map((f) => f.name).sort()).toEqual([
      'Inter-Bold',
      'Inter-Regular',
      'Newsreader16pt-Italic',
      'Newsreader16pt-Medium',
      'Newsreader16pt-Regular',
    ]);
    for (const font of embedded) {
      expect(font.glyphs, font.name).toBeLessThan(font.full / 4);
    }
  });
});

describe('resume PDF bytes', () => {
  it('are identical when an unchanged resume is rebuilt later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-01T00:00:00.000Z'));
      const first = await renderResumePdf(liveResume);
      vi.setSystemTime(new Date('2026-11-15T12:34:56.000Z'));
      const second = await renderResumePdf(structuredClone(liveResume));
      expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

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
