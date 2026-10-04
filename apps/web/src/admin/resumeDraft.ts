import {
  RESUME_MONTH_PATTERN,
  type Resume,
  type ResumeContent,
} from '@gagnechris/shared';
import { newRepeaterId } from '../workspace/ui/repeaterId';

export type ExperienceDraft = {
  id: string;
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
  earlierRolesBeforeText: string;
  summary: string;
  competenciesText: string;
  experience: ExperienceDraft[];
  skillsText: string;
  education: EducationDraft[];
};

export const emptyExperience = (): ExperienceDraft => ({
  id: newRepeaterId(),
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
  earlierRolesBeforeText:
    resume.content.earlierRolesBefore === undefined
      ? ''
      : String(resume.content.earlierRolesBefore),
  summary: resume.content.summary,
  competenciesText: resume.content.competencies.join('\n'),
  experience: resume.content.experience.map((item) => ({
    id: newRepeaterId(),
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

// An end month without a start, or before it, is dropped: the server would
// reject it and autosave would keep failing.
const experienceFromDraft = (
  item: ExperienceDraft,
): ResumeContent['experience'][number] => {
  const start = validMonth(item.start);
  const end = start && !item.present ? validMonth(item.end) : undefined;
  const note = item.note.trim();
  return {
    title: item.title.trim(),
    company: item.company.trim(),
    ...(start ? { start, end: end && end >= start ? end : null } : {}),
    ...(note ? { note } : {}),
    bullets: parseResumeLines(item.bulletsText),
  };
};

export const resumeContentFromDraft = (
  draft: ResumeDraftFields,
): ResumeContent => {
  const headline = draft.headline.trim();
  const earlierRolesBefore = parseCutoffYear(draft.earlierRolesBeforeText);
  return {
    ...(headline ? { headline } : {}),
    ...(earlierRolesBefore !== undefined ? { earlierRolesBefore } : {}),
    summary: draft.summary.trim(),
    competencies: parseResumeLines(draft.competenciesText),
    experience: draft.experience.map(experienceFromDraft),
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
