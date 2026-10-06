import {
  DEFAULT_RESUME,
  RESUME_MONTH_PATTERN,
  SITE_AUTHOR_NAME,
  type Resume,
  type ResumeContent,
} from '@gagnechris/shared';
import { newRepeaterId } from '../workspace/ui/repeaterId';

export type RoleDates = { start: string; end: string | null };

export type ExperienceDraft = {
  id: string;
  /** Dates on the server when the draft was loaded; null for a new or undated role. */
  loadedDates: RoleDates | null;
  title: string;
  company: string;
  start: string;
  end: string;
  present: boolean;
  note: string;
  bulletsText: string;
};

export type EducationDraft = {
  id: string;
  title: string;
  degreeDetail: string;
  institution: string;
  location: string;
  year: string;
};

export type ResumeDraftFields = {
  name: string;
  pdfPath: string;
  headline: string;
  earlierRolesThroughText: string;
  summary: string;
  competenciesText: string;
  experience: ExperienceDraft[];
  skillsText: string;
  education: EducationDraft[];
};

export const RESUME_PDF_PATH = DEFAULT_RESUME.pdfPath;

export const emptyExperience = (): ExperienceDraft => ({
  id: newRepeaterId(),
  loadedDates: null,
  title: '',
  company: '',
  start: '',
  end: '',
  present: false,
  note: '',
  bulletsText: '',
});

export const emptyEducation = (): EducationDraft => ({
  id: newRepeaterId(),
  title: '',
  degreeDetail: '',
  institution: '',
  location: '',
  year: '',
});

/** Normalize list fields for the API / preview — not applied back onto the live draft. */
export const parseResumeLines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const resumeDraftFromResume = (resume: Resume): ResumeDraftFields => ({
  name: resume.name,
  pdfPath: resume.pdfPath,
  headline: resume.content.headline ?? '',
  earlierRolesThroughText:
    resume.content.earlierRolesThrough === undefined
      ? ''
      : String(resume.content.earlierRolesThrough),
  summary: resume.content.summary,
  competenciesText: resume.content.competencies.join('\n'),
  experience: resume.content.experience.map((item) => ({
    id: newRepeaterId(),
    loadedDates: item.start
      ? { start: item.start, end: item.end ?? null }
      : null,
    title: item.title,
    company: item.company,
    start: item.start ?? '',
    end: item.end ?? '',
    present: Boolean(item.start) && !item.end,
    note: item.note ?? '',
    bulletsText: item.bullets.join('\n'),
  })),
  skillsText: resume.content.skills.join('\n'),
  education: resume.content.education.map((item) => ({
    id: newRepeaterId(),
    title: item.title,
    degreeDetail: item.degreeDetail ?? '',
    institution: item.institution,
    location: item.location,
    year: item.year,
  })),
});

const validMonth = (value: string): string | undefined => {
  const trimmed = value.trim();
  return RESUME_MONTH_PATTERN.test(trimmed) ? trimmed : undefined;
};

/** A blank or partial year means "no cut-off" rather than a failed save. */
const parseCutoffYear = (text: string): number | undefined => {
  const trimmed = text.trim();
  if (!/^\d{4}$/.test(trimmed)) return undefined;
  const year = Number(trimmed);
  return year >= 1900 && year <= 2100 ? year : undefined;
};

export const roleTitle = (role: ExperienceDraft) =>
  role.title.trim() || 'New role';

export const resumeRoleEndId = (roleId: string) => `resume-role-${roleId}-end`;

export const END_BEFORE_START = 'End is before start';

export const experienceRangeError = (
  item: ExperienceDraft,
): string | undefined => {
  const start = validMonth(item.start);
  const end = item.present ? undefined : validMonth(item.end);
  return start && end && end < start ? END_BEFORE_START : undefined;
};

export const hasExperienceRangeError = (draft: ResumeDraftFields): boolean =>
  draft.experience.some((item) => experienceRangeError(item) !== undefined);

type SavedDatesLookup = (item: ExperienceDraft) => RoleDates | null;

const loadedDatesOnly: SavedDatesLookup = (item) => item.loadedDates;

// Dates the server would reject (end without start, end before start) never go
// into the payload, so autosave cannot loop on a 400; the draft keeps them. An
// end before start sends the role's saved dates instead, so the stored draft
// (and anything published from it) never loses them.
const experienceFromDraft = (
  item: ExperienceDraft,
  savedDates: SavedDatesLookup,
): ResumeContent['experience'][number] => {
  const start = validMonth(item.start);
  const end = start && !item.present ? validMonth(item.end) : undefined;
  const note = item.note.trim();
  const dates = experienceRangeError(item)
    ? savedDates(item)
    : start
      ? { start, end: end ?? null }
      : null;
  return {
    title: item.title.trim(),
    company: item.company.trim(),
    ...(dates ?? {}),
    ...(note ? { note } : {}),
    bullets: parseResumeLines(item.bulletsText),
  };
};

export const resumeContentFromDraft = (
  draft: ResumeDraftFields,
  savedDates: SavedDatesLookup = loadedDatesOnly,
): ResumeContent => {
  const headline = draft.headline.trim();
  const earlierRolesThrough = parseCutoffYear(draft.earlierRolesThroughText);
  return {
    ...(headline ? { headline } : {}),
    ...(earlierRolesThrough !== undefined ? { earlierRolesThrough } : {}),
    summary: draft.summary.trim(),
    competencies: parseResumeLines(draft.competenciesText),
    experience: draft.experience.map((item) =>
      experienceFromDraft(item, savedDates),
    ),
    skills: parseResumeLines(draft.skillsText),
    education: draft.education.map((item) => ({
      title: item.title.trim(),
      institution: item.institution.trim(),
      location: item.location.trim(),
      year: item.year.trim(),
      ...(item.degreeDetail.trim()
        ? { degreeDetail: item.degreeDetail.trim() }
        : {}),
    })),
  };
};

const roleDates = (
  role: Pick<ResumeContent['experience'][number], 'start' | 'end'>,
): RoleDates | null =>
  role.start ? { start: role.start, end: role.end ?? null } : null;

const sameDates = (a: RoleDates | null, b: RoleDates | null) =>
  a === b || (!!a && !!b && a.start === b.start && a.end === b.end);

type SavedResume = Pick<Resume, 'content'>;

/**
 * Remembers each role's dates as last saved, so a role whose range turns
 * invalid keeps sending them rather than the dates it was loaded with. A
 * payload's dates count only once the saved resume holds them.
 */
export const createResumeContentBuilder = () => {
  let saved = new Map<string, RoleDates | null>();
  let pending: { ids: string[]; dates: (RoleDates | null)[] } | null = null;
  const sync = (entity: SavedResume) => {
    const experience = entity.content.experience;
    if (
      pending &&
      experience.length === pending.dates.length &&
      experience.every((role, i) =>
        sameDates(roleDates(role), pending!.dates[i]!),
      )
    ) {
      const { ids, dates } = pending;
      saved = new Map(ids.map((id, i) => [id, dates[i]!]));
      pending = null;
    }
  };
  const lookup: SavedDatesLookup = (item) =>
    saved.has(item.id) ? saved.get(item.id)! : item.loadedDates;
  const savedDates = (item: ExperienceDraft, entity: SavedResume) => {
    sync(entity);
    return lookup(item);
  };
  return {
    savedDates,
    preview: (draft: ResumeDraftFields, entity: SavedResume) => {
      sync(entity);
      return resumeContentFromDraft(draft, lookup);
    },
    payload: (draft: ResumeDraftFields, entity: SavedResume) => {
      sync(entity);
      const content = resumeContentFromDraft(draft, lookup);
      pending = {
        ids: draft.experience.map((item) => item.id),
        dates: content.experience.map(roleDates),
      };
      return content;
    },
    /** Roles in error with no saved dates to fall back on would publish undated. */
    undatedRangeErrors: (draft: ResumeDraftFields, entity: SavedResume) =>
      draft.experience.filter(
        (item) =>
          experienceRangeError(item) !== undefined && !savedDates(item, entity),
      ),
  };
};

export type ResumeContentBuilder = ReturnType<
  typeof createResumeContentBuilder
>;

export const emptyResumeDraft = (): ResumeDraftFields =>
  resumeDraftFromResume({
    ...DEFAULT_RESUME,
    status: 'draft',
    publishedAt: null,
    updatedAt: '',
    version: 0,
    hasUnpublishedChanges: false,
  });

export const resumePayload = (
  draft: ResumeDraftFields,
  content: ResumeContentBuilder,
  saved: SavedResume,
) => ({
  name: draft.name.trim() || SITE_AUTHOR_NAME,
  pdfPath: RESUME_PDF_PATH,
  content: content.payload(draft, saved),
});
