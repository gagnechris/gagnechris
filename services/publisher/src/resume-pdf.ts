import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  PDFString,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import { Logger } from '@aws-lambda-powertools/logger';
import {
  APEX_DOMAIN,
  normalizeResumeText as normalize,
  PUBLISHER_SERVICE_NAME,
  resumeView,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
  type Resume,
  type ResumeEducationLine,
  type ResumeRoleView,
  type ResumeSkillRow,
  type ResumeView,
} from '@gagnechris/shared';

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 43.2; // 0.6in
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const DATE_COLUMN = 100;
const BODY_X = MARGIN + DATE_COLUMN + 16;
const BODY_WIDTH = PAGE_WIDTH - MARGIN - BODY_X;
const BULLET_INDENT = 10;
const MAX_PAGES = 2;

const hex = (value: string): RGB =>
  rgb(
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  );

const COLOR_INK = hex('#16191d');
const COLOR_INK_SOFT = hex('#4a515a');
const COLOR_BODY = hex('#2b3138');
const COLOR_DATE = hex('#4d5871');
const COLOR_LABEL = hex('#384259');
const COLOR_RULE_SOFT = hex('#e5e8ed');

const FONT_FILES = {
  sans: 'Inter-Regular.ttf',
  sansBold: 'Inter-Bold.ttf',
  serif: 'Newsreader16pt-Regular.ttf',
  serifItalic: 'Newsreader16pt-Italic.ttf',
  serifMedium: 'Newsreader16pt-Medium.ttf',
} as const;

type FaceName = keyof typeof FONT_FILES;

// Tabular figures keep the date column aligned; no ligatures, so copied text
// and ATS extraction see plain letters.
const FONT_FEATURES: Record<FaceName, Record<string, boolean>> = {
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
type Faces = Record<FaceName, Face>;

type Style = {
  face: FaceName;
  size: number;
  color: RGB;
  tracking?: number;
};

type Span = { text: string; style: Style };
type Line = Span[];

type DrawCtx = {
  doc: PDFDocument | null;
  page: PDFPage | null;
  pages: number;
  faces: Faces;
  y: number;
};

const fontBytesCache = new Map<FaceName, Uint8Array>();
const fontkitCache = new Map<FaceName, FontkitFont>();
const emWidthCache = new Map<FaceName, Map<string, number>>();

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

function fontBytes(face: FaceName): Uint8Array {
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

const measureFaces = (): Faces =>
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

function textWidth(faces: Faces, text: string, style: Style): number {
  let width = 0;
  for (const run of fontRuns(faces, text, style.face)) {
    width += runWidth(run, style.size);
  }
  return width + (style.tracking ?? 0) * [...text].length;
}

function wrapSpans(faces: Faces, spans: Span[], maxWidth: number): Line[] {
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

function drawSpans(
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

const baselineOffset = (size: number, lineHeight: number): number =>
  (lineHeight - size) / 2 + size * 0.8;

const lineSize = (line: Line): number =>
  Math.max(...line.map((span) => span.style.size));

function ensureSpace(ctx: DrawCtx, needed: number): void {
  if (ctx.y - needed >= MARGIN) return;
  ctx.pages += 1;
  if (ctx.doc) ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
}

/** Breaks across pages line by line. */
function drawLines(
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

const wrapBody = (ctx: DrawCtx, spans: Span[], width = BODY_WIDTH) =>
  wrapSpans(ctx.faces, spans, width);

/** Date-column text sharing the first baseline of the row's body. */
function drawLeftColumn(
  ctx: DrawCtx,
  spans: Span[],
  top: number,
  firstBaseline: number,
): void {
  wrapSpans(ctx.faces, spans, DATE_COLUMN).forEach((line, i) => {
    drawSpans(ctx, line, MARGIN, top - firstBaseline - i * LH.date);
  });
}

function drawRule(ctx: DrawCtx, color: RGB, thickness: number): void {
  ctx.page?.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness,
    color,
  });
}

const S = {
  name: { face: 'serifMedium', size: 24, color: COLOR_INK },
  headline: { face: 'serifItalic', size: 12, color: COLOR_INK_SOFT },
  contact: { face: 'sans', size: 8.5, color: COLOR_DATE },
  summary: { face: 'serif', size: 10.5, color: COLOR_BODY },
  label: { face: 'sansBold', size: 8, color: COLOR_INK, tracking: 0.5 },
  date: { face: 'sans', size: 9, color: COLOR_DATE },
  note: { face: 'sans', size: 8, color: COLOR_DATE },
  roleTitle: { face: 'serifMedium', size: 12, color: COLOR_INK },
  roleCompany: { face: 'serifItalic', size: 12, color: COLOR_INK_SOFT },
  bullet: { face: 'serif', size: 10.5, color: COLOR_BODY },
  earlierTitle: { face: 'serif', size: 10.5, color: COLOR_INK },
  earlierCompany: { face: 'serifItalic', size: 10.5, color: COLOR_INK_SOFT },
  skillLabel: { face: 'sansBold', size: 8, color: COLOR_LABEL },
  skillValue: { face: 'serif', size: 10.5, color: COLOR_BODY },
  eduTitle: { face: 'serif', size: 10.5, color: COLOR_INK },
  eduPlace: { face: 'serifItalic', size: 9.5, color: COLOR_INK_SOFT },
} satisfies Record<string, Style>;

const LH = {
  name: 28,
  headline: 16,
  contact: 12,
  summary: 14.5,
  label: 11,
  date: 12,
  role: 16,
  bullet: 13.6,
  earlier: 15,
  skill: 13.6,
  edu: 13.6,
  eduPlace: 12.5,
};

const SECTION_GAP = 16;

function drawSectionLabel(ctx: DrawCtx, title: string, keepWith: number) {
  const ruleGap = 5;
  const below = 10;
  ensureSpace(ctx, LH.label + ruleGap + below + keepWith);
  drawLines(
    ctx,
    [[{ text: title.toUpperCase(), style: S.label }]],
    MARGIN,
    LH.label,
  );
  ctx.y -= ruleGap;
  drawRule(ctx, COLOR_INK, 0.75);
  ctx.y -= below;
}

function roleHeading(
  role: ResumeRoleView,
  title: Style,
  company: Style,
): Span[] {
  const spans: Span[] = [{ text: role.title, style: title }];
  if (role.company) {
    spans.push({ text: ` at ${role.company}`, style: company });
  }
  return spans;
}

function drawRole(ctx: DrawCtx, role: ResumeRoleView): void {
  const title = wrapBody(ctx, roleHeading(role, S.roleTitle, S.roleCompany));
  const bullets = role.bullets.map((b) =>
    wrapBody(ctx, [{ text: b, style: S.bullet }], BODY_WIDTH - BULLET_INDENT),
  );
  const titleGap = 3;
  const firstBulletLines = Math.min(bullets[0]?.length ?? 0, 2);
  ensureSpace(
    ctx,
    title.length * LH.role + titleGap + firstBulletLines * LH.bullet,
  );

  const top = ctx.y;
  const firstBaseline = baselineOffset(S.roleTitle.size, LH.role);
  const { dates } = role;
  if (dates)
    drawLeftColumn(ctx, [{ text: dates, style: S.date }], top, firstBaseline);
  drawLines(ctx, title, BODY_X, LH.role);
  if (role.note) {
    drawLeftColumn(
      ctx,
      [{ text: role.note, style: S.note }],
      top,
      firstBaseline + (dates ? LH.date : 0),
    );
  }
  ctx.y -= titleGap;

  for (const lines of bullets) {
    lines.forEach((line, i) => {
      ensureSpace(ctx, LH.bullet);
      const baseline = ctx.y - baselineOffset(S.bullet.size, LH.bullet);
      if (i === 0) {
        drawSpans(ctx, [{ text: '•', style: S.bullet }], BODY_X, baseline);
      }
      drawSpans(ctx, line, BODY_X + BULLET_INDENT, baseline);
      ctx.y -= LH.bullet;
    });
    ctx.y -= 1.5;
  }
}

function drawEarlierRole(ctx: DrawCtx, role: ResumeRoleView): void {
  const lines = wrapBody(
    ctx,
    roleHeading(role, S.earlierTitle, S.earlierCompany),
  );
  ensureSpace(ctx, lines.length * LH.earlier);
  const { dates } = role;
  if (dates) {
    drawLeftColumn(
      ctx,
      [{ text: dates, style: S.date }],
      ctx.y,
      baselineOffset(S.earlierTitle.size, LH.earlier),
    );
  }
  drawLines(ctx, lines, BODY_X, LH.earlier);
}

function drawRoleRule(ctx: DrawCtx): void {
  if (ctx.y - 14 < MARGIN) return;
  ctx.y -= 6;
  drawRule(ctx, COLOR_RULE_SOFT, 0.5);
  ctx.y -= 8;
}

function drawSkillRow(ctx: DrawCtx, { label, value }: ResumeSkillRow): void {
  const valueLines = wrapBody(ctx, [{ text: value, style: S.skillValue }]);
  const labelSpans: Span[] = [{ text: label, style: S.skillLabel }];
  const labelLines = label
    ? wrapSpans(ctx.faces, labelSpans, DATE_COLUMN).length
    : 0;
  const height =
    Math.max(valueLines.length * LH.skill, labelLines * LH.date) + 4;
  ensureSpace(ctx, height);
  const top = ctx.y;
  if (label) {
    drawLeftColumn(
      ctx,
      labelSpans,
      top,
      baselineOffset(S.skillValue.size, LH.skill),
    );
  }
  drawLines(ctx, valueLines, BODY_X, LH.skill);
  ctx.y = top - height;
}

function drawEducation(
  ctx: DrawCtx,
  { year, title, place }: ResumeEducationLine,
): void {
  const titleLines = wrapBody(ctx, [{ text: title, style: S.eduTitle }]);
  const placeLines = place
    ? wrapBody(ctx, [{ text: place, style: S.eduPlace }])
    : [];
  ensureSpace(
    ctx,
    titleLines.length * LH.edu + placeLines.length * LH.eduPlace,
  );
  if (year) {
    drawLeftColumn(
      ctx,
      [{ text: year, style: S.date }],
      ctx.y,
      baselineOffset(S.eduTitle.size, LH.edu),
    );
  }
  drawLines(ctx, titleLines, BODY_X, LH.edu);
  drawLines(ctx, placeLines, BODY_X, LH.eduPlace);
}

const CONTACT_LINKS = [
  `https://${APEX_DOMAIN}`,
  SITE_LINKEDIN_URL,
  SITE_GITHUB_URL,
] as const;

const displayUrl = (url: string): string =>
  url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function addLink(
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

function drawContactLine(ctx: DrawCtx): void {
  const baseline = ctx.y - baselineOffset(S.contact.size, LH.contact);
  let x = MARGIN;
  CONTACT_LINKS.forEach((url, i) => {
    if (i > 0) {
      x = drawSpans(ctx, [{ text: '  ·  ', style: S.contact }], x, baseline);
    }
    const start = x;
    x = drawSpans(
      ctx,
      [{ text: displayUrl(url), style: S.contact }],
      x,
      baseline,
    );
    addLink(ctx, [start, baseline - 2.5, x, baseline + S.contact.size], url);
  });
  ctx.y -= LH.contact;
}

/** `content.headline` as stored, else the role with no end date. */
function currentRoleLine(resume: Resume, view: ResumeView): string | null {
  const headline = resume.content.headline?.trim();
  if (headline) return normalize(headline);
  const current = view.roles.find((role) => role.start && !role.end);
  if (!current) return null;
  return current.company
    ? `${current.title} at ${current.company}`
    : current.title;
}

/** Ended roles, oldest first: the order they drop to one line to fit. */
function collapseOrder(roles: ResumeRoleView[]): number[] {
  return roles
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.start && item.end)
    .sort(
      (a, b) => a.item.start!.localeCompare(b.item.start!) || b.index - a.index,
    )
    .map(({ index }) => index);
}

export const RESUME_PDF_KEY = 'resume.pdf';
export const RESUME_PDF_PUBLIC_PATH = '/resume.pdf';
export const RESUME_PDF_DOWNLOAD_FILENAME = 'Chris-Gagne-Resume.pdf';
export const RESUME_PDF_CONTENT_DISPOSITION = `attachment; filename="${RESUME_PDF_DOWNLOAD_FILENAME}"`;

function resumePdfDate(resume: Resume): Date {
  const date = new Date(resume.publishedAt ?? resume.updatedAt);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function layoutResume(
  ctx: DrawCtx,
  resume: Resume,
  view: ResumeView,
  collapsed: ReadonlySet<number>,
): void {
  const drawFull = (text: string, style: Style, lineHeight: number) =>
    drawLines(
      ctx,
      wrapSpans(ctx.faces, [{ text: normalize(text), style }], CONTENT_WIDTH),
      MARGIN,
      lineHeight,
    );

  drawFull(resume.name, S.name, LH.name);
  const role = currentRoleLine(resume, view);
  if (role) drawFull(role, S.headline, LH.headline);
  ctx.y -= 3;
  drawContactLine(ctx);

  const { content } = resume;
  if (content.summary.trim()) {
    ctx.y -= 10;
    drawFull(content.summary, S.summary, LH.summary);
  }

  const { labels, roles, competencies, skills, education } = view;
  if (roles.length > 0) {
    ctx.y -= SECTION_GAP;
    drawSectionLabel(ctx, labels.experience, LH.role + LH.bullet * 2);
    roles.forEach((item, i) => {
      const short = collapsed.has(i);
      if (i > 0 && !(short && collapsed.has(i - 1))) drawRoleRule(ctx);
      if (short) drawEarlierRole(ctx, item);
      else drawRole(ctx, item);
    });
  }

  if (competencies.length > 0 || skills.length > 0) {
    ctx.y -= SECTION_GAP;
    drawSectionLabel(ctx, labels.skills, LH.skill * 2);
    if (competencies.length > 0) {
      drawFull(competencies.join(' · '), S.skillValue, LH.skill);
      ctx.y -= 6;
    }
    for (const skill of skills) drawSkillRow(ctx, skill);
  }

  if (education.length > 0) {
    ctx.y -= SECTION_GAP;
    drawSectionLabel(ctx, labels.education, LH.edu + LH.eduPlace);
    education.forEach((item, i) => {
      if (i > 0) ctx.y -= 6;
      drawEducation(ctx, item);
    });
  }
}

const newCtx = (faces: Faces, doc: PDFDocument | null = null): DrawCtx => ({
  doc,
  page: doc ? doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]) : null,
  pages: 1,
  faces,
  y: PAGE_HEIGHT - MARGIN,
});

/**
 * Embedded Inter and Newsreader, not WinAnsi standard fonts, so Unicode text
 * renders. Ended roles drop to one line, oldest first, until the resume fits
 * on two pages; the fit is measured without a PDF, then drawn once.
 */
export async function renderResumePdf(resume: Resume): Promise<Uint8Array> {
  const view = resumeView(resume);
  const order = collapseOrder(view.roles);
  const faces = measureFaces();
  let collapsed = new Set<number>();
  for (let count = 0; count <= order.length; count++) {
    collapsed = new Set(order.slice(0, count));
    const ctx = newCtx(faces);
    layoutResume(ctx, resume, view, collapsed);
    if (ctx.pages <= MAX_PAGES) break;
  }

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${sanitizeResumePdfText(resume.name)} — Resume`);
  doc.setAuthor(sanitizeResumePdfText(resume.name));
  // pdf-lib stamps "now" by default; pin the dates so an unchanged resume
  // renders identical bytes and a no-op rebuild skips the put.
  const stamp = resumePdfDate(resume);
  doc.setCreationDate(stamp);
  doc.setModificationDate(stamp);
  for (const name of Object.keys(FONT_FILES) as FaceName[]) {
    faces[name] = {
      ...faces[name],
      pdf: await doc.embedFont(fontBytes(name), {
        subset: true,
        features: FONT_FEATURES[name],
      }),
    };
  }
  layoutResume(newCtx(faces, doc), resume, view, collapsed);
  return doc.save();
}

const logger = new Logger({ serviceName: PUBLISHER_SERVICE_NAME });

const RESUME_PDF_CACHE_CONTROL = 'public,max-age=0,must-revalidate';

export type ResumePdfArtifactResult =
  | {
      ok: true;
      artifact: {
        key: string;
        body: Uint8Array;
        contentType: string;
        cacheControl: string;
        contentDisposition: string;
      };
    }
  | { ok: false };

/** Returns `{ ok: false }` on failure so the caller can keep the existing S3 object. */
export async function buildResumePdfArtifact(
  resume: Resume,
  render: typeof renderResumePdf = renderResumePdf,
): Promise<ResumePdfArtifactResult> {
  try {
    const pdfBytes = await render(resume);
    return {
      ok: true,
      artifact: {
        key: RESUME_PDF_KEY,
        body: pdfBytes,
        contentType: 'application/pdf',
        cacheControl: RESUME_PDF_CACHE_CONTROL,
        contentDisposition: RESUME_PDF_CONTENT_DISPOSITION,
      },
    };
  } catch (error) {
    logger.error('Resume PDF generation failed; keeping previous resume.pdf', {
      error,
    });
    return { ok: false };
  }
}
