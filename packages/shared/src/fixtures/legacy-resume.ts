import { DEFAULT_RESUME } from '../resume-default.js';
import type { Resume, ResumeContent } from '../schemas.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** The `company` strings stored before experience had `start`/`end`, in `DEFAULT_RESUME` order. */
export const LEGACY_COMPANY_LINES = [
  'Ro | July 2019 - Present',
  'JW Player | March 2017 - July 2019',
  'Shutterstock | September 2014 - March 2017',
  'Viacom | September 2014 - April 2015',
  'Getty Images | June 2012 - September 2014',
  'Dealertrack | August 2010 - June 2012',
  'Dealertrack | December 2004 - August 2010',
  'Psyche Systems Corporation | July 2000 - December 2004',
  'Daystar Corporation | January 1999 - April 2000',
] as const;

/** `DEFAULT_RESUME` content in the old shape: dates inside `company`, no headline or cut-off. */
export const legacyResumeContent = (): ResumeContent => {
  const { summary, competencies, skills, education, experience } = clone(
    DEFAULT_RESUME.content,
  );
  return {
    summary,
    competencies,
    experience: experience.map(({ title, bullets }, i) => ({
      title,
      company: LEGACY_COMPANY_LINES[i]!,
      bullets,
    })),
    skills,
    education,
  };
};

export const legacyResume = (): Resume => ({
  ...clone(DEFAULT_RESUME),
  content: legacyResumeContent(),
});
