import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  PDFString,
  setCharacterSpacing,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

export const PAGE_WIDTH = 612; // US Letter
export const PAGE_HEIGHT = 792;
export const MARGIN = 43.2; // 0.6in

export const FONT_FILES = {
  sans: 'Inter-Regular.ttf',
  sansBold: 'Inter-Bold.ttf',
  serif: 'Newsreader16pt-Regular.ttf',
  serifItalic: 'Newsreader16pt-Italic.ttf',
  serifMedium: 'Newsreader16pt-Medium.ttf',
} as const;

export type FaceName = keyof typeof FONT_FILES;

// Tabular figures keep the date column aligned; no ligatures, so copied text
// and ATS extraction see plain letters.
export const FONT_FEATURES: Record<FaceName, Record<string, boolean>> = {
  sans: { tnum: true },
  sansBold: { tnum: true },
  serif: { liga: false },
  serifItalic: { liga: false },
  serifMedium: { liga: false },
};

const MISSING_GLYPH = '?';

type FontkitFont = {
  unitsPerEm: number;
  hasGlyphForCodePoint(codePoint: number): boolean;
  layout(
    text: string,
    features?: Record<string, boolean>,
  ): { glyphs: { advanceWidth: number }[] };
};

/** `pdf` is unset while measuring, so the fit passes embed nothing. */
type Face = { name: FaceName; fk: FontkitFont; pdf?: PDFFont };
export type Faces = Record<FaceName, Face>;

export type Style = {
  face: FaceName;
  size: number;
  color: RGB;
  tracking?: number;
};

export type Span = { text: string; style: Style };
export type Line = Span[];

export type DrawCtx = {
  doc: PDFDocument | null;
  page: PDFPage | null;
  pages: number;
  faces: Faces;
  y: number;
};

const fontBytesCache = new Map<FaceName, Uint8Array>();
const fontkitCache = new Map<FaceName, FontkitFont>();
const emWidthCache = new Map<FaceName, Map<string, number>>();

/**
 * The Lambda bundle copies the fonts to `<task root>/assets/fonts`; from
 * source (tests, local rebuilds) they sit next to `src/`. The bundle is CJS,
 * where `import.meta.url` is empty, so it is only read off Lambda.
 */
function fontsDir(): string {
  const taskRoot = process.env.LAMBDA_TASK_ROOT;
  if (taskRoot) return join(taskRoot, 'assets', 'fonts');
  return join(dirname(fileURLToPath(import.meta.url)), '../assets/fonts');
}

function resolveFontFile(filename: string): string {
  const path = join(fontsDir(), filename);
  if (!existsSync(path)) {
    throw new Error(`Resume PDF font not found: ${path}`);
  }
  return path;
}

export function fontBytes(face: FaceName): Uint8Array {
  let bytes = fontBytesCache.get(face);
  if (!bytes) {
    bytes = new Uint8Array(readFileSync(resolveFontFile(FONT_FILES[face])));
    fontBytesCache.set(face, bytes);
  }
  return bytes;
}

function fontkitFont(face: FaceName): FontkitFont {
  let fk = fontkitCache.get(face);
  if (!fk) {
    fk = fontkit.create(fontBytes(face)) as FontkitFont;
    fontkitCache.set(face, fk);
  }
  return fk;
}

export const measureFaces = (): Faces =>
  Object.fromEntries(
    (Object.keys(FONT_FILES) as FaceName[]).map((name) => [
      name,
      { name, fk: fontkitFont(name) },
    ]),
  ) as Faces;

// The measuring and drawing passes share these widths, so both break lines
// and pages in the same places.
function runWidth(run: Run, size: number): number {
  let cache = emWidthCache.get(run.face.name);
  if (!cache) {
    cache = new Map();
    emWidthCache.set(run.face.name, cache);
  }
  let em = cache.get(run.text);
  if (em === undefined) {
    const { fk } = run.face;
    em = 0;
    for (const glyph of fk.layout(run.text, FONT_FEATURES[run.face.name])
      .glyphs) {
      em += glyph.advanceWidth;
    }
    em /= fk.unitsPerEm;
    cache.set(run.text, em);
  }
  return em * size;
}

/** embedFont(subset) + drawText throw on code points Inter cannot draw. */
export function sanitizeResumePdfText(text: string): string {
  const fk = fontkitFont('sans');
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

type Run = { text: string; face: Face };

/** Characters the face lacks fall back to Inter, then to `?`. */
function fontRuns(faces: Faces, text: string, faceName: FaceName): Run[] {
  const primary = faces[faceName];
  const runs: Run[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0)!;
    let face = primary;
    let out = char;
    if (!primary.fk.hasGlyphForCodePoint(cp)) {
      if (faces.sans.fk.hasGlyphForCodePoint(cp)) face = faces.sans;
      else out = MISSING_GLYPH;
    }
    const last = runs[runs.length - 1];
    if (last && last.face === face) last.text += out;
    else runs.push({ text: out, face });
  }
  return runs;
}

export function textWidth(faces: Faces, text: string, style: Style): number {
  let width = 0;
  for (const run of fontRuns(faces, text, style.face)) {
    width += runWidth(run, style.size);
  }
  return width + (style.tracking ?? 0) * [...text].length;
}

export function wrapSpans(
  faces: Faces,
  spans: Span[],
  maxWidth: number,
): Line[] {
  const lines: Line[] = [];
  let line: Line = [];
  let width = 0;
  for (const span of spans) {
    for (const raw of span.text.match(/\s*\S+/g) ?? []) {
      const word = raw.trimStart();
      const space = raw !== word ? textWidth(faces, ' ', span.style) : 0;
      const wordWidth = textWidth(faces, word, span.style);
      if (line.length > 0 && width + space + wordWidth > maxWidth) {
        lines.push(line);
        line = [];
        width = 0;
      }
      const spaced = line.length > 0 && space > 0;
      const text = spaced ? ` ${word}` : word;
      width += (spaced ? space : 0) + wordWidth;
      const last = line[line.length - 1];
      if (last && last.style === span.style) last.text += text;
      else line.push({ text, style: span.style });
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export function drawSpans(
  ctx: DrawCtx,
  line: Line,
  x: number,
  baseline: number,
): number {
  let cursor = x;
  for (const span of line) {
    const tracking = span.style.tracking ?? 0;
    const { page } = ctx;
    if (page && tracking) page.pushOperators(setCharacterSpacing(tracking));
    for (const run of fontRuns(ctx.faces, span.text, span.style.face)) {
      if (page) {
        page.drawText(run.text, {
          x: cursor,
          y: baseline,
          size: span.style.size,
          font: run.face.pdf,
          color: span.style.color,
        });
      }
      cursor +=
        runWidth(run, span.style.size) + tracking * [...run.text].length;
    }
    if (page && tracking) page.pushOperators(setCharacterSpacing(0));
  }
  return cursor;
}

export const baselineOffset = (size: number, lineHeight: number): number =>
  (lineHeight - size) / 2 + size * 0.8;

const lineSize = (line: Line): number =>
  Math.max(...line.map((span) => span.style.size));

export function ensureSpace(ctx: DrawCtx, needed: number): void {
  if (ctx.y - needed >= MARGIN) return;
  ctx.pages += 1;
  if (ctx.doc) ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

/** Breaks across pages line by line. */
export function drawLines(
  ctx: DrawCtx,
  lines: Line[],
  x: number,
  lineHeight: number,
): void {
  for (const line of lines) {
    ensureSpace(ctx, lineHeight);
    drawSpans(ctx, line, x, ctx.y - baselineOffset(lineSize(line), lineHeight));
    ctx.y -= lineHeight;
  }
}

export function drawRule(ctx: DrawCtx, color: RGB, thickness: number): void {
  ctx.page?.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness,
    color,
  });
}

export function addLink(
  ctx: DrawCtx,
  rect: [number, number, number, number],
  url: string,
): void {
  if (!ctx.doc || !ctx.page) return;
  const { context } = ctx.doc;
  const annot = context.register(
    context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: rect,
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }),
  );
  ctx.page.node.addAnnot(annot);
}

export const newCtx = (
  faces: Faces,
  doc: PDFDocument | null = null,
): DrawCtx => ({
  doc,
  page: doc ? doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]) : null,
  pages: 1,
  faces,
  y: PAGE_HEIGHT - MARGIN,
});
