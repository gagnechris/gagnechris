import {
  isEarlierResumeRole,
  resumeEarlierRolesLabel,
  resumeRoleDates,
  structuredExperience,
} from './resume-dates.js';
import type {
  ResumeContent,
  ResumeEducation,
  ResumeExperience,
} from './schemas.js';

export const RESUME_SECTION_LABELS = {
  experience: 'Experience',
  skills: 'Strengths and skills',
  education: 'Education',
} as const;

export type ResumeRoleView = {
  title: string;
  /** Null when blank, so no renderer prints "Title at ". */
  company: string | null;
  dates: string;
  note: string | null;
  bullets: string[];
  start?: string;
  end?: string | null;
  earlier: boolean;
};

export type ResumeSkillRow = { label: string; value: string };

export type ResumeEducationLine = {
  year: string;
  title: string;
  place: string;
};

export type ResumeView = {
  labels: typeof RESUME_SECTION_LABELS;
  /** Content order; `earlier` marks roles inside `earlierLabel`. */
  roles: ResumeRoleView[];
  earlierLabel: string | null;
  competencies: string[];
  skills: ResumeSkillRow[];
  education: ResumeEducationLine[];
};

export const normalizeResumeText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim();

const roleView = (
  raw: ResumeExperience,
  cutoff: number | undefined,
): ResumeRoleView => {
  const item = structuredExperience(raw);
  const company = normalizeResumeText(item.company);
  const note = item.note ? normalizeResumeText(item.note) : '';
  return {
    title: normalizeResumeText(item.title),
    company: company || null,
    dates: resumeRoleDates(item),
    note: note || null,
    bullets: item.bullets.map(normalizeResumeText),
    start: item.start,
    end: item.end,
    earlier: isEarlierResumeRole(item, cutoff),
  };
};

/** `Label: value` is a label/value row; a line without a colon is value only. */
const skillRow = (line: string): ResumeSkillRow => {
  const colon = line.indexOf(':');
  return colon > 0
    ? {
        label: normalizeResumeText(line.slice(0, colon)),
        value: normalizeResumeText(line.slice(colon + 1)),
      }
    : { label: '', value: normalizeResumeText(line) };
};

const educationLine = (item: ResumeEducation): ResumeEducationLine => ({
  year: normalizeResumeText(item.year),
  title: normalizeResumeText(
    item.degreeDetail ? `${item.title}, ${item.degreeDetail}` : item.title,
  ),
  place: [item.institution, item.location]
    .map((part) => normalizeResumeText(part))
    .filter(Boolean)
    .join(', '),
});

/** The resume HTML and PDF both render from this, so they say the same thing. */
export const resumeView = ({
  content,
}: {
  content: ResumeContent;
}): ResumeView => {
  const roles = content.experience.map((item) =>
    roleView(item, content.earlierRolesThrough),
  );
  return {
    labels: RESUME_SECTION_LABELS,
    roles,
    earlierLabel: resumeEarlierRolesLabel(
      roles.filter((role) => role.earlier),
      content.earlierRolesThrough,
    ),
    competencies: content.competencies.map(normalizeResumeText),
    skills: content.skills.map(skillRow),
    education: content.education.map(educationLine),
  };
};
