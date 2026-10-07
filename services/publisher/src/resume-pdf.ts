import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type RGB } from 'pdf-lib';
import {
  APEX_DOMAIN,
  normalizeResumeText as normalize,
  resumeView,
  SITE_GITHUB_URL,
  SITE_LINKEDIN_URL,
  type Resume,
  type ResumeEducationLine,
  type ResumeRoleView,
  type ResumeSkillRow,
  type ResumeView,
} from '@gagnechris/shared';
import { RESUME_DOWNLOAD_FILENAME } from '@gagnechris/shared/render';
import { logger } from './observability.js';
import {
  FONT_FEATURES,
  FONT_FILES,
  MARGIN,
  PAGE_WIDTH,
  addLink,
  baselineOffset,
  drawLines,
  drawRule,
  drawSpans,
  ensureSpace,
  fontBytes,
  measureFaces,
  newCtx,
  sanitizeResumePdfText,
  wrapSpans,
  type DrawCtx,
  type FaceName,
  type Span,
  type Style,
} from './pdf-text.js';
import { CACHE_HTML, type PublishArtifact } from './publish-targets/types.js';

export { sanitizeResumePdfText };

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const DATE_COLUMN = 100;
const COLUMN_GUTTER = 16;
const BODY_X = MARGIN + DATE_COLUMN + COLUMN_GUTTER;
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

/** Vertical gaps, in points. */
const GAP = {
  afterHeadline: 3,
  beforeSummary: 10,
  section: 16,
  labelToRule: 5,
  ruleToContent: 10,
  roleTitleToBullets: 3,
  afterBullet: 1.5,
  aboveRoleRule: 6,
  belowRoleRule: 8,
  afterCompetencies: 6,
  afterSkillRow: 4,
  betweenEducation: 6,
} as const;

/** How far a link's hit box reaches below the text baseline. */
const LINK_DESCENT = 2.5;

function drawSectionLabel(ctx: DrawCtx, title: string, keepWith: number) {
  ensureSpace(ctx, LH.label + GAP.labelToRule + GAP.ruleToContent + keepWith);
  drawLines(
    ctx,
    [[{ text: title.toUpperCase(), style: S.label }]],
    MARGIN,
    LH.label,
  );
  ctx.y -= GAP.labelToRule;
  drawRule(ctx, COLOR_INK, 0.75);
  ctx.y -= GAP.ruleToContent;
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
  const firstBulletLines = Math.min(bullets[0]?.length ?? 0, 2);
  ensureSpace(
    ctx,
    title.length * LH.role +
      GAP.roleTitleToBullets +
      firstBulletLines * LH.bullet,
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
  ctx.y -= GAP.roleTitleToBullets;

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
    ctx.y -= GAP.afterBullet;
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
  if (ctx.y - GAP.aboveRoleRule - GAP.belowRoleRule < MARGIN) return;
  ctx.y -= GAP.aboveRoleRule;
  drawRule(ctx, COLOR_RULE_SOFT, 0.5);
  ctx.y -= GAP.belowRoleRule;
}

function drawSkillRow(ctx: DrawCtx, { label, value }: ResumeSkillRow): void {
  const valueLines = wrapBody(ctx, [{ text: value, style: S.skillValue }]);
  const labelSpans: Span[] = [{ text: label, style: S.skillLabel }];
  const labelLines = label
    ? wrapSpans(ctx.faces, labelSpans, DATE_COLUMN).length
    : 0;
  const height =
    Math.max(valueLines.length * LH.skill, labelLines * LH.date) +
    GAP.afterSkillRow;
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
    addLink(
      ctx,
      [start, baseline - LINK_DESCENT, x, baseline + S.contact.size],
      url,
    );
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
export const RESUME_PDF_CONTENT_DISPOSITION = `attachment; filename="${RESUME_DOWNLOAD_FILENAME}"`;

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
  ctx.y -= GAP.afterHeadline;
  drawContactLine(ctx);

  const { content } = resume;
  if (content.summary.trim()) {
    ctx.y -= GAP.beforeSummary;
    drawFull(content.summary, S.summary, LH.summary);
  }

  const { labels, roles, competencies, skills, education } = view;
  if (roles.length > 0) {
    ctx.y -= GAP.section;
    drawSectionLabel(ctx, labels.experience, LH.role + LH.bullet * 2);
    roles.forEach((item, i) => {
      const short = collapsed.has(i);
      if (i > 0 && !(short && collapsed.has(i - 1))) drawRoleRule(ctx);
      if (short) drawEarlierRole(ctx, item);
      else drawRole(ctx, item);
    });
  }

  if (competencies.length > 0 || skills.length > 0) {
    ctx.y -= GAP.section;
    drawSectionLabel(ctx, labels.skills, LH.skill * 2);
    if (competencies.length > 0) {
      drawFull(competencies.join(' · '), S.skillValue, LH.skill);
      ctx.y -= GAP.afterCompetencies;
    }
    for (const skill of skills) drawSkillRow(ctx, skill);
  }

  if (education.length > 0) {
    ctx.y -= GAP.section;
    drawSectionLabel(ctx, labels.education, LH.edu + LH.eduPlace);
    education.forEach((item, i) => {
      if (i > 0) ctx.y -= GAP.betweenEducation;
      drawEducation(ctx, item);
    });
  }
}

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
  let pages = 0;
  for (let count = 0; count <= order.length; count++) {
    collapsed = new Set(order.slice(0, count));
    const ctx = newCtx(faces);
    layoutResume(ctx, resume, view, collapsed);
    pages = ctx.pages;
    if (pages <= MAX_PAGES) break;
  }
  if (pages > MAX_PAGES) {
    logger.warn(
      'Resume PDF does not fit even with every ended role collapsed',
      {
        pages,
        maxPages: MAX_PAGES,
      },
    );
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

export type ResumePdfArtifactResult =
  { ok: true; artifact: PublishArtifact } | { ok: false };

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
        cacheControl: CACHE_HTML,
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
