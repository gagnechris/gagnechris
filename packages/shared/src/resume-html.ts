import { textExcerpt } from './excerpt.js';
import { escapeHtml } from './html.js';
import {
  resumeView,
  type ResumeRoleView,
  type ResumeView,
} from './resume-view.js';
import type { Resume, ResumeContent } from './schemas.js';
import { SITE_LINKEDIN_URL } from './site-config.js';
import { renderSitePageHtml } from './site-chrome-html.js';

// `apps/web/src/pages/Resume.tsx` renders the intro element for element
// (coldLoadParity.test.tsx) and reuses the body as `.resume-body` innerHTML.

export const RESUME_PAGE_TITLE = 'Resume';
export const RESUME_UNAVAILABLE_TEXT = 'Resume available on request.';
export const RESUME_DOWNLOAD_LABEL = 'Download PDF';
export const RESUME_DOWNLOAD_FILENAME = 'Chris-Gagne-Resume.pdf';
export const RESUME_DOWNLOAD_ICON_PATH =
  'M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10';

export type ResumeActionLink = {
  label: string;
  href: string;
  kind: 'spa' | 'external';
  trackId?: string;
};

export const RESUME_ACTION_LINKS: readonly ResumeActionLink[] = [
  {
    label: 'LinkedIn',
    href: SITE_LINKEDIN_URL,
    kind: 'external',
    trackId: 'linkedin',
  },
  { label: 'Get in touch', href: '/contact', kind: 'spa' },
];

export type ResumeIntro = {
  headline: string | null;
  summary: string;
  /** Null hides Download PDF (unpublished resume). */
  pdfPath: string | null;
};

const downloadIconHtml =
  '<svg class="resume-download__icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  `<path d="${RESUME_DOWNLOAD_ICON_PATH}"></path></svg>`;

const actionLinkHtml = (link: ResumeActionLink): string =>
  link.kind === 'external'
    ? `<a class="resume-intro__link" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`
    : `<a class="resume-intro__link" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`;

export const renderResumeIntroHtml = ({
  headline,
  summary,
  pdfPath,
}: ResumeIntro): string =>
  `<header class="resume-intro">` +
  `<h1 class="resume-intro__title">${RESUME_PAGE_TITLE}</h1>` +
  (headline
    ? `<p class="resume-intro__headline">${escapeHtml(headline)}</p>`
    : '') +
  `<p class="resume-intro__summary">${escapeHtml(summary)}</p>` +
  `<p class="resume-intro__actions">` +
  (pdfPath
    ? `<a class="resume-download" href="${escapeHtml(pdfPath)}" download="${RESUME_DOWNLOAD_FILENAME}">${downloadIconHtml}${RESUME_DOWNLOAD_LABEL}</a>`
    : '') +
  RESUME_ACTION_LINKS.map(actionLinkHtml).join('') +
  `</p></header>`;

const sectionHtml = (id: string, label: string, inner: string): string =>
  `<section class="resume-section" aria-labelledby="${id}">` +
  `<h2 class="resume-section__label" id="${id}">${escapeHtml(label)}</h2>${inner}</section>`;

const roleHeadingHtml = ({ title, company }: ResumeRoleView): string =>
  company
    ? `${escapeHtml(title)} <span class="resume-role__company">at ${escapeHtml(company)}</span>`
    : escapeHtml(title);

const roleDatesHtml = (role: ResumeRoleView): string => {
  const note = role.note
    ? `<span class="resume-role__note">${escapeHtml(role.note)}</span>`
    : '';
  return `<p class="resume-role__dates">${escapeHtml(role.dates)}${note}</p>`;
};

const roleHtml = (role: ResumeRoleView): string => {
  const bullets = role.bullets.length
    ? `<ul class="resume-role__bullets">${role.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
    : '';
  return (
    `<li class="resume-role">${roleDatesHtml(role)}` +
    `<div class="resume-role__body"><h3 class="resume-role__title">${roleHeadingHtml(role)}</h3>${bullets}</div></li>`
  );
};

const rolesHtml = (roles: ResumeRoleView[]): string =>
  roles.length
    ? `<ol class="resume-roles">${roles.map(roleHtml).join('')}</ol>`
    : '';

// Closed, the one-line list shows; open, the full entries inside <details>
// replace it (a CSS sibling rule), so it needs no JS.
const earlierRolesHtml = (roles: ResumeRoleView[], label: string): string =>
  `<div class="resume-earlier">` +
  `<details class="resume-earlier__details">` +
  `<summary class="resume-earlier__summary">` +
  `<span class="resume-earlier__label">${escapeHtml(label)}</span>` +
  `<span class="resume-earlier__toggle"><span class="resume-earlier__show">Show details</span><span class="resume-earlier__hide">Hide details</span></span>` +
  `</summary>${rolesHtml(roles)}</details>` +
  `<ol class="resume-earlier__list">` +
  roles
    .map(
      (role) =>
        `<li class="resume-earlier__item">${roleDatesHtml(role)}<p class="resume-earlier__role">${roleHeadingHtml(role)}</p></li>`,
    )
    .join('') +
  `</ol></div>`;

const experienceHtml = ({ labels, roles, earlierLabel }: ResumeView): string =>
  sectionHtml(
    'resume-experience',
    labels.experience,
    rolesHtml(roles.filter((role) => !role.earlier)) +
      (earlierLabel
        ? earlierRolesHtml(
            roles.filter((role) => role.earlier),
            earlierLabel,
          )
        : ''),
  );

const skillsHtml = ({ labels, competencies, skills }: ResumeView): string => {
  const competenciesHtml = competencies.length
    ? `<p class="resume-competencies">${competencies.map(escapeHtml).join(' · ')}</p>`
    : '';
  const skillsListHtml = skills.length
    ? `<dl class="resume-skills">${skills
        .map(
          ({ label, value }) =>
            `<div class="resume-skill"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
        )
        .join('')}</dl>`
    : '';
  if (!competenciesHtml && !skillsListHtml) return '';
  return sectionHtml(
    'resume-skills',
    labels.skills,
    competenciesHtml + skillsListHtml,
  );
};

const educationHtml = ({ labels, education }: ResumeView): string => {
  if (!education.length) return '';
  const entries = education
    .map(
      ({ year, title, place }) =>
        `<li class="resume-role">` +
        `<p class="resume-role__dates">${escapeHtml(year)}</p>` +
        `<div class="resume-role__body"><h3 class="resume-education__title">${escapeHtml(title)}</h3>` +
        `<p class="resume-education__place">${escapeHtml(place)}</p></div></li>`,
    )
    .join('');
  return sectionHtml(
    'resume-education',
    labels.education,
    `<ol class="resume-roles resume-roles--education">${entries}</ol>`,
  );
};

/** Everything below the intro. */
export const renderResumeSectionsHtml = (content: ResumeContent): string => {
  const view = resumeView({ content });
  return [experienceHtml(view), skillsHtml(view), educationHtml(view)].join('');
};

export const resumeIntro = (resume: Resume): ResumeIntro => ({
  headline: resume.content.headline?.trim() || null,
  summary: resume.content.summary,
  pdfPath: resume.pdfPath,
});

/** The marker class is what the SPA parses. */
export const renderResumeBodyHtml = (resume: Resume): string =>
  `<main class="resume-page resume-page-prerender">` +
  renderResumeIntroHtml(resumeIntro(resume)) +
  `<div class="resume-body">${renderResumeSectionsHtml(resume.content)}</div></main>`;

export const renderResumeUnavailableBodyHtml = (): string =>
  `<main class="resume-page resume-page-unavailable">` +
  renderResumeIntroHtml({
    headline: null,
    summary: RESUME_UNAVAILABLE_TEXT,
    pdfPath: null,
  }) +
  `</main>`;

export const renderResumePrerenderHtml = (
  resume: Resume,
  year?: number,
): string => renderSitePageHtml('/resume', renderResumeBodyHtml(resume), year);

export const renderResumeUnavailablePrerenderHtml = (year?: number): string =>
  renderSitePageHtml('/resume', renderResumeUnavailableBodyHtml(), year);

export const resumeSummaryExcerpt = (summary: string, max = 200): string =>
  textExcerpt(summary, max);
