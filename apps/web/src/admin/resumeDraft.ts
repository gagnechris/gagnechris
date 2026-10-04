import {
  RESUME_MONTH_PATTERN,
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

/**
 * Remembers the dates each role last sent, so a role whose range turns invalid
 * keeps sending them rather than the dates it was loaded with.
 */
export const createResumeContentBuilder = () => {
  const sent = new Map<string, RoleDates | null>();
  const savedDates: SavedDatesLookup = (item) =>
    sent.has(item.id) ? sent.get(item.id)! : item.loadedDates;
  return {
    savedDates,
    preview: (draft: ResumeDraftFields) =>
      resumeContentFromDraft(draft, savedDates),
    payload: (draft: ResumeDraftFields) => {
      const content = resumeContentFromDraft(draft, savedDates);
      draft.experience.forEach((item, index) => {
        const role = content.experience[index]!;
        sent.set(
          item.id,
          role.start ? { start: role.start, end: role.end ?? null } : null,
        );
      });
      return content;
    },
    /** Roles in error with no saved dates to fall back on would publish undated. */
    undatedRangeErrors: (draft: ResumeDraftFields) =>
      draft.experience.filter(
        (item) => experienceRangeError(item) !== undefined && !savedDates(item),
      ),
  };
};
