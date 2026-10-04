import type { ResumeContent, ResumeExperience } from './schemas.js';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** `2019-07` → `July 2019`. */
export const formatResumeMonth = (month: string): string => {
  const [year, mm] = month.split('-');
  const name = MONTH_NAMES[Number(mm) - 1];
  return name && year ? `${name} ${year}` : month;
};

export const formatResumeDateRange = (
  start: string,
  end: string | null | undefined,
): string =>
  `${formatResumeMonth(start)} - ${end ? formatResumeMonth(end) : 'Present'}`;

/** Company plus dates as one line; rows without `start` keep their dates in `company`. */
export const experienceCompanyLine = (
  item: Pick<ResumeExperience, 'company' | 'start' | 'end'>,
): string =>
  item.start
    ? `${item.company} | ${formatResumeDateRange(item.start, item.end)}`
    : item.company;

export type LegacyCompanyLineParse =
  | { ok: true; company: string; start: string; end: string | null }
  | { ok: false; reason: string };

const LEGACY_LINE = /^(.+?)\s*\|\s*([A-Za-z]+)\s+(\d{4})\s*-\s*(.+?)\s*$/;
const MONTH_YEAR = /^([A-Za-z]+)\s+(\d{4})$/;

const monthNumber = (name: string): number =>
  MONTH_NAMES.findIndex((m) => m.toLowerCase() === name.toLowerCase()) + 1;

const toMonth = (name: string, year: string): string | undefined => {
  const n = monthNumber(name);
  return n > 0 ? `${year}-${String(n).padStart(2, '0')}` : undefined;
};

/**
 * Parses `Company | Month YYYY - Month YYYY` (or `- Present`). Only accepts
 * lines that re-render byte-for-byte, so migrating never changes the page.
 */
export const parseLegacyCompanyLine = (
  line: string,
): LegacyCompanyLineParse => {
  const match = LEGACY_LINE.exec(line);
  if (!match) return { ok: false, reason: 'no "Company | Month YYYY - …"' };
  const [, company, startName, startYear, endText] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  const start = toMonth(startName, startYear);
  if (!start) return { ok: false, reason: 'unknown start month' };
  let end: string | null = null;
  if (endText.toLowerCase() !== 'present') {
    const endMatch = MONTH_YEAR.exec(endText);
    const parsed = endMatch ? toMonth(endMatch[1]!, endMatch[2]!) : undefined;
    if (!parsed) return { ok: false, reason: 'unparseable end date' };
    end = parsed;
  }
  if (end !== null && end < start) {
    return { ok: false, reason: 'end is before start' };
  }
  if (company.includes('|')) {
    return { ok: false, reason: 'more than one "|"' };
  }
  if (experienceCompanyLine({ company, start, end }) !== line) {
    return { ok: false, reason: 'would render differently' };
  }
  return { ok: true, company, start, end };
};

export type ResumeDateMigrationRow =
  | {
      index: number;
      status: 'migrated' | 'already';
      company: string;
      start: string;
      end: string | null;
    }
  | { index: number; status: 'unparseable'; company: string; reason: string };

export type ResumeDateMigrationPlan = {
  content: ResumeContent;
  rows: ResumeDateMigrationRow[];
  changed: boolean;
};

/** Unparseable rows are reported and left as they are, never guessed. */
export const planResumeDateMigration = (
  content: ResumeContent,
): ResumeDateMigrationPlan => {
  const rows: ResumeDateMigrationRow[] = [];
  const experience = content.experience.map((item, index) => {
    if (item.start) {
      rows.push({
        index,
        status: 'already',
        company: item.company,
        start: item.start,
        end: item.end ?? null,
      });
      return item;
    }
    const parsed = parseLegacyCompanyLine(item.company);
    if (!parsed.ok) {
      rows.push({
        index,
        status: 'unparseable',
        company: item.company,
        reason: parsed.reason,
      });
      return item;
    }
    const { company, start, end } = parsed;
    rows.push({ index, status: 'migrated', company, start, end });
    return { ...item, company, start, end };
  });
  const changed = rows.some((row) => row.status === 'migrated');
  return {
    content: changed ? { ...content, experience } : content,
    rows,
    changed,
  };
};

/** `2019-07` → `Jul 2019`. */
export const formatResumeShortMonth = (month: string): string => {
  const [year, mm] = month.split('-');
  const name = MONTH_NAMES[Number(mm) - 1];
  return name && year ? `${name.slice(0, 3)} ${year}` : month;
};

/** Old-shape rows are read through the legacy parser so both shapes render alike. */
export const structuredExperience = (
  item: ResumeExperience,
): ResumeExperience => {
  if (item.start) return item;
  const parsed = parseLegacyCompanyLine(item.company);
  return parsed.ok
    ? { ...item, company: parsed.company, start: parsed.start, end: parsed.end }
    : item;
};

/** `Jul 2019 – Present`; empty for a row with no `start`. */
export const resumeRoleDates = (
  item: Pick<ResumeExperience, 'start' | 'end'>,
): string =>
  item.start
    ? `${formatResumeShortMonth(item.start)} – ${item.end ? formatResumeShortMonth(item.end) : 'Present'}`
    : '';

export type ResumeExperienceGroups = {
  recent: ResumeExperience[];
  earlier: ResumeExperience[];
  /** `Earlier roles, 1999–2012`; null when there are no earlier roles. */
  earlierLabel: string | null;
};

/** Roles that ended in or before `earlierRolesThrough` (a year) are earlier roles; unset keeps every role recent. */
export const groupResumeExperience = (
  content: Pick<ResumeContent, 'experience' | 'earlierRolesThrough'>,
): ResumeExperienceGroups => {
  const items = content.experience.map(structuredExperience);
  const cutoff = content.earlierRolesThrough;
  const isEarlier = (item: ResumeExperience): boolean =>
    cutoff !== undefined &&
    !!item.start &&
    !!item.end &&
    Number(item.end.slice(0, 4)) <= cutoff;
  const earlier = items.filter(isEarlier);
  const recent = items.filter((item) => !isEarlier(item));
  if (cutoff === undefined || earlier.length === 0) {
    return { recent, earlier, earlierLabel: null };
  }
  const first = Math.min(
    ...earlier.map((item) => Number(item.start!.slice(0, 4))),
  );
  return { recent, earlier, earlierLabel: `Earlier roles, ${first}–${cutoff}` };
};
