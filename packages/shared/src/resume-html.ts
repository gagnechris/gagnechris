import { textExcerpt } from './excerpt.js';
import { escapeHtml } from './html.js';
import type { Resume, ResumeContent } from './schemas.js';

const listItems = (items: string[]): string =>
  items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

/** Two balanced columns once the list is long enough to be worth splitting. */
const competencyColumns = (items: string[]): string[][] => {
  if (items.length <= 4) return [items];
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
};

const summarySection = (summary: string): string =>
  `<section class="resume-summary"><h2>Summary</h2><p>${escapeHtml(summary)}</p></section>`;

const competenciesSection = (items: string[]): string => {
  const columns = competencyColumns(items)
    .map((column) => `<ul class="competencies-list">${listItems(column)}</ul>`)
    .join('');
  return `<section class="resume-section"><h2>Core Competencies</h2><div class="competencies-container">${columns}</div></section>`;
};

const experienceSection = (items: ResumeContent['experience']): string => {
  const entries = items
    .map(
      (item) =>
        `<div class="experience-item"><h3>${escapeHtml(item.title)}</h3><p class="company">${escapeHtml(item.company)}</p><ul class="experience-list">${listItems(item.bullets)}</ul></div>`,
    )
    .join('');
  return `<section class="resume-section"><h2>Professional Experience</h2>${entries}</section>`;
};

const skillsSection = (items: string[]): string =>
  `<section class="resume-section"><h2>Technical Skills</h2><div class="competencies-container"><ul class="competencies-list">${listItems(items)}</ul></div></section>`;

const educationSection = (items: ResumeContent['education']): string => {
  const entries = items
    .map((item) => {
      const detail = item.degreeDetail
        ? `<p class="degree-detail">${escapeHtml(item.degreeDetail)}</p>`
        : '';
      return `<div class="education-item"><h3>${escapeHtml(item.title)}</h3>${detail}<p class="institution">${escapeHtml(item.institution)}</p><p class="location">${escapeHtml(item.location)}</p><p class="year">${escapeHtml(item.year)}</p></div>`;
    })
    .join('');
  return `<section class="resume-section"><h2>Education</h2>${entries}</section>`;
};

/** Section markup only — classes match `apps/web/src/pages/Resume.css`. */
export const renderResumeSectionsHtml = (content: ResumeContent): string =>
  [
    summarySection(content.summary),
    competenciesSection(content.competencies),
    experienceSection(content.experience),
    skillsSection(content.skills),
    educationSection(content.education),
  ].join('');

/** Full prerendered article the publisher writes and the SPA reads back. */
export const renderResumePrerenderHtml = (resume: Resume): string =>
  `<article class="resume-page-prerender" data-name="${escapeHtml(resume.name)}" data-pdf="${escapeHtml(resume.pdfPath)}"><header><div class="name-section"><h1>${escapeHtml(resume.name)}</h1></div></header><main>${renderResumeSectionsHtml(resume.content)}</main></article>`;

/** Meta-description fallback when `seo.description` is unset. */
export const resumeSummaryExcerpt = (summary: string, max = 200): string =>
  textExcerpt(summary, max);
