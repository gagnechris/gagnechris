import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Resume } from '@gagnechris/shared';

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 43; // ~0.6in
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR_TEXT = rgb(0.15, 0.15, 0.18);
const COLOR_MUTED = rgb(0.35, 0.35, 0.4);
const COLOR_RULE = rgb(0.75, 0.78, 0.82);

type DrawCtx = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  y: number;
};

function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
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
  const lines = wrapLines(font, text, size, maxWidth);
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
  const lines = wrapLines(ctx.font, text, size, CONTENT_WIDTH - indent);
  const lineHeight = size * 1.35;
  for (let i = 0; i < lines.length; i++) {
    ensureSpace(ctx, lineHeight);
    if (i === 0) {
      ctx.page.drawText('•', {
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

/**
 * Build a multi-page US Letter PDF from structured resume content (pdf-lib).
 */
export async function renderResumePdf(resume: Resume): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${resume.name} — Resume`);
  doc.setAuthor(resume.name);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

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
