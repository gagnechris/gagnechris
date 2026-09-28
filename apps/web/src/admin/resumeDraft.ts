import type { components } from '../api/schema';
import { newRepeaterId } from '../ui/repeaterId';

type Resume = components['schemas']['Resume'];
type ResumeContent = components['schemas']['ResumeContent'];

export type ExperienceDraft = {
  id: string;
  title: string;
  company: string;
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
  summary: resume.content.summary,
  competenciesText: resume.content.competencies.join('\n'),
  experience: resume.content.experience.map((item) => ({
    id: newRepeaterId(),
    title: item.title,
    company: item.company,
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

export const resumeContentFromDraft = (
  draft: ResumeDraftFields,
): ResumeContent => ({
  summary: draft.summary.trim(),
  competencies: parseResumeLines(draft.competenciesText),
  experience: draft.experience.map((item) => ({
    title: item.title.trim(),
    company: item.company.trim(),
    bullets: parseResumeLines(item.bulletsText),
  })),
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
});
