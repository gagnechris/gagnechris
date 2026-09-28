import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Resume } from '@gagnechris/shared';

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 43; // ~0.6in
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR_TEXT = rgb(0.15, 0.15, 0.18);
const COLOR_MUTED = rgb(0.35, 0.35, 0.4);
const COLOR_RULE = rgb(0.75, 0.78, 0.82);

const FONT_REGULAR = 'Inter-Regular.ttf';
const FONT_BOLD = 'Inter-Bold.ttf';

/** Replacement when Inter has no glyph (e.g. emoji). */
const MISSING_GLYPH = '?';

type DrawCtx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
};

type FontkitFont = {
  hasGlyphForCodePoint(codePoint: number): boolean;
};

let cachedRegularBytes: Uint8Array | undefined;
let cachedBoldBytes: Uint8Array | undefined;
let cachedRegularFontkit: FontkitFont | undefined;

function fontsDirCandidates(): string[] {
  const dirs: string[] = [];
  // Lambda task root (and local cwd when tests run from services/publisher).
  const taskRoot = process.env.LAMBDA_TASK_ROOT ?? process.cwd();
  dirs.push(join(taskRoot, 'assets', 'fonts'));
  // Repo-root local rebuilds (tsx from monorepo root).
  dirs.push(join(process.cwd(), 'services/publisher/assets/fonts'));
  // Source layout when import.meta.url is available (vitest / ESM). CDK
  // NodejsFunction emits CJS where import.meta.url is empty — skip then.
  try {
    const metaUrl = import.meta.url;
    if (metaUrl) {
      const here = dirname(fileURLToPath(metaUrl));
      dirs.push(join(here, 'assets', 'fonts'));
      dirs.push(join(here, '../assets/fonts'));
    }
  } catch {
    // ignore
  }
  return dirs;
}

function resolveFontFile(filename: string): string {
  for (const dir of fontsDirCandidates()) {
    const path = join(dir, filename);
    if (existsSync(path)) return path;
  }
  throw new Error(
    `Resume PDF font not found: ${filename} (searched ${fontsDirCandidates().join(', ')})`,
  );
}

function loadFontBytes(filename: string): Uint8Array {
  return new Uint8Array(readFileSync(resolveFontFile(filename)));
}

function getRegularFontBytes(): Uint8Array {
  cachedRegularBytes ??= loadFontBytes(FONT_REGULAR);
  return cachedRegularBytes;
}

function getBoldFontBytes(): Uint8Array {
  cachedBoldBytes ??= loadFontBytes(FONT_BOLD);
  return cachedBoldBytes;
}

function getRegularFontkit(): FontkitFont {
  if (!cachedRegularFontkit) {
    cachedRegularFontkit = fontkit.create(getRegularFontBytes()) as FontkitFont;
  }
  return cachedRegularFontkit;
}

/**
 * Drop / replace code points Inter cannot draw so embedFont(subset) + drawText
 * never throw on emoji or rare symbols.
 */
export function sanitizeResumePdfText(text: string): string {
  const fk = getRegularFontkit();
  let out = '';
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (cp === 0x0a || cp === 0x0d || cp === 0x09) {
      out += char;
      continue;
    }
    out += fk.hasGlyphForCodePoint(cp) ? char : MISSING_GLYPH;
  }
  return out;
}

function wrapLines(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function ensureSpace(ctx: DrawCtx, needed: number): void {
  if (ctx.y - needed >= MARGIN) return;
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

function drawText(
  ctx: DrawCtx,
  text: string,
  size: number,
  font: PDFFont,
  color = COLOR_TEXT,
  maxWidth = CONTENT_WIDTH,
): void {
  const safe = sanitizeResumePdfText(text);
  const lines = wrapLines(font, safe, size, maxWidth);
  const lineHeight = size * 1.35;
  for (const line of lines) {
    ensureSpace(ctx, lineHeight);
    ctx.page.drawText(line, {
      x: MARGIN,
      y: ctx.y - size,
      size,
      font,
      color,
    });
    ctx.y -= lineHeight;
  }
}

function drawSectionHeading(ctx: DrawCtx, title: string): void {
  ctx.y -= 10;
  ensureSpace(ctx, 28);
  drawText(ctx, title.toUpperCase(), 11, ctx.fontBold, COLOR_TEXT);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y + 2 },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y + 2 },
    thickness: 0.75,
    color: COLOR_RULE,
  });
  ctx.y -= 8;
}

function drawBullet(ctx: DrawCtx, text: string): void {
  const size = 9.5;
  const indent = 14;
  const safe = sanitizeResumePdfText(text);
  const lines = wrapLines(ctx.font, safe, size, CONTENT_WIDTH - indent);
  const lineHeight = size * 1.35;
  const bullet = sanitizeResumePdfText('•');
  for (let i = 0; i < lines.length; i++) {
    ensureSpace(ctx, lineHeight);
    if (i === 0) {
      ctx.page.drawText(bullet, {
        x: MARGIN + 2,
        y: ctx.y - size,
        size,
        font: ctx.font,
        color: COLOR_TEXT,
      });
    }
    ctx.page.drawText(lines[i]!, {
      x: MARGIN + indent,
      y: ctx.y - size,
      size,
      font: ctx.font,
      color: COLOR_TEXT,
    });
    ctx.y -= lineHeight;
  }
}

/** Stable public path for the publisher-generated resume PDF. */
export const RESUME_PDF_KEY = 'resume.pdf';
export const RESUME_PDF_PUBLIC_PATH = '/resume.pdf';
/** Suggested download filename (S3 Content-Disposition + client download attr). */
export const RESUME_PDF_DOWNLOAD_FILENAME = 'Chris-Gagne-Resume.pdf';
export const RESUME_PDF_CONTENT_DISPOSITION = `attachment; filename="${RESUME_PDF_DOWNLOAD_FILENAME}"`;

/**
 * Build a multi-page US Letter PDF from structured resume content (pdf-lib).
 * Uses embedded Inter (Unicode) with subsetting — not WinAnsi standard fonts.
 */
export async function renderResumePdf(resume: Resume): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${sanitizeResumePdfText(resume.name)} — Resume`);
  doc.setAuthor(sanitizeResumePdfText(resume.name));

  const font = await doc.embedFont(getRegularFontBytes(), { subset: true });
  const fontBold = await doc.embedFont(getBoldFontBytes(), { subset: true });

  const ctx: DrawCtx = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    font,
    fontBold,
    y: PAGE_HEIGHT - MARGIN,
  };

  drawText(ctx, resume.name, 20, fontBold);
  ctx.y -= 4;
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 1.5,
    color: COLOR_RULE,
  });
  ctx.y -= 16;

  const { content } = resume;

  drawSectionHeading(ctx, 'Summary');
  drawText(ctx, content.summary, 10, font);

  if (content.competencies.length > 0) {
    drawSectionHeading(ctx, 'Core Competencies');
    for (const item of content.competencies) {
      drawBullet(ctx, item);
    }
  }

  if (content.experience.length > 0) {
    drawSectionHeading(ctx, 'Professional Experience');
    for (const job of content.experience) {
      ctx.y -= 4;
      drawText(ctx, job.title, 11, fontBold);
      drawText(ctx, job.company, 9.5, font, COLOR_MUTED);
      ctx.y -= 2;
      for (const bullet of job.bullets) {
        drawBullet(ctx, bullet);
      }
      ctx.y -= 4;
    }
  }

  if (content.skills.length > 0) {
    drawSectionHeading(ctx, 'Technical Skills');
    for (const skill of content.skills) {
      drawBullet(ctx, skill);
    }
  }

  if (content.education.length > 0) {
    drawSectionHeading(ctx, 'Education');
    for (const edu of content.education) {
      ctx.y -= 2;
      drawText(ctx, edu.title, 11, fontBold);
      if (edu.degreeDetail) {
        drawText(ctx, edu.degreeDetail, 9.5, font, COLOR_MUTED);
      }
      drawText(
        ctx,
        `${edu.institution} — ${edu.location} — ${edu.year}`,
        9.5,
        font,
        COLOR_MUTED,
      );
      ctx.y -= 4;
    }
  }

  return doc.save();
}
