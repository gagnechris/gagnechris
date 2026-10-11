/** @jsxRuntime automatic */
import type { ReactNode } from 'react';
import {
  resumeView,
  type ResumeContent,
  type ResumeRoleView,
  type ResumeView,
} from '@gagnechris/shared';
import {
  RESUME_ACTION_LINKS,
  RESUME_DOWNLOAD_FILENAME,
  RESUME_DOWNLOAD_ICON_PATH,
  RESUME_DOWNLOAD_LABEL,
  RESUME_PAGE_TITLE,
  RESUME_UNAVAILABLE_TEXT,
  type ResumeIntro,
} from '@gagnechris/shared/render';
import { PublicLink } from '../link.js';

// Text runs are single template strings: adjacent text children would make
// the server renderer print `<!-- -->` between them.

const DownloadIcon = () => (
  <svg
    className="resume-download__icon"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={RESUME_DOWNLOAD_ICON_PATH}></path>
  </svg>
);

const IntroHeader = ({
  headline,
  summary,
  pdfPath,
  onDownload,
}: ResumeIntro & { onDownload?: () => void }) => (
  <header className="resume-intro">
    <h1 className="resume-intro__title">{RESUME_PAGE_TITLE}</h1>
    {headline ? <p className="resume-intro__headline">{headline}</p> : null}
    <p className="resume-intro__summary">{summary}</p>
    <p className="resume-intro__actions">
      {pdfPath ? (
        <a
          className="resume-download"
          href={pdfPath}
          download={RESUME_DOWNLOAD_FILENAME}
          onClick={onDownload}
        >
          <DownloadIcon />
          {RESUME_DOWNLOAD_LABEL}
        </a>
      ) : null}
      {RESUME_ACTION_LINKS.map((link) => (
        <PublicLink
          key={link.href}
          className="resume-intro__link"
          href={link.href}
          spa={link.kind === 'spa'}
          newTab={link.kind === 'external'}
          trackId={link.trackId}
        >
          {link.label}
        </PublicLink>
      ))}
    </p>
  </header>
);

const Section = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) => (
  <section className="resume-section" aria-labelledby={id}>
    <h2 className="resume-section__label" id={id}>
      {label}
    </h2>
    {children}
  </section>
);

const RoleHeading = ({ title, company }: ResumeRoleView) =>
  company ? (
    <>
      {`${title} `}
      <span className="resume-role__company">{`at ${company}`}</span>
    </>
  ) : (
    title
  );

const RoleDates = ({ dates, note }: ResumeRoleView) => (
  <p className="resume-role__dates">
    {dates}
    {note ? <span className="resume-role__note">{note}</span> : null}
  </p>
);

const Roles = ({ roles }: { roles: readonly ResumeRoleView[] }) =>
  roles.length ? (
    <ol className="resume-roles">
      {roles.map((role, i) => (
        <li key={i} className="resume-role">
          <RoleDates {...role} />
          <div className="resume-role__body">
            <h3 className="resume-role__title">
              <RoleHeading {...role} />
            </h3>
            {role.bullets.length ? (
              <ul className="resume-role__bullets">
                {role.bullets.map((bullet, j) => (
                  <li key={j}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  ) : null;

// Closed, the one-line list shows; open, the full entries inside <details>
// replace it (a CSS sibling rule), so it needs no JS.
const EarlierRoles = ({
  roles,
  label,
}: {
  roles: readonly ResumeRoleView[];
  label: string;
}) => (
  <div className="resume-earlier">
    <details className="resume-earlier__details">
      <summary className="resume-earlier__summary">
        <span className="resume-earlier__label">{label}</span>
        <span className="resume-earlier__toggle">
          <span className="resume-earlier__show">Show details</span>
          <span className="resume-earlier__hide">Hide details</span>
        </span>
      </summary>
      <Roles roles={roles} />
    </details>
    <ol className="resume-earlier__list">
      {roles.map((role, i) => (
        <li key={i} className="resume-earlier__item">
          <RoleDates {...role} />
          <p className="resume-earlier__role">
            <RoleHeading {...role} />
          </p>
        </li>
      ))}
    </ol>
  </div>
);

const Experience = ({ labels, roles, earlierLabel }: ResumeView) => (
  <Section id="resume-experience" label={labels.experience}>
    <Roles roles={roles.filter((role) => !role.earlier)} />
    {earlierLabel ? (
      <EarlierRoles
        roles={roles.filter((role) => role.earlier)}
        label={earlierLabel}
      />
    ) : null}
  </Section>
);

const Skills = ({ labels, competencies, skills }: ResumeView) =>
  competencies.length || skills.length ? (
    <Section id="resume-skills" label={labels.skills}>
      {competencies.length ? (
        <p className="resume-competencies">{competencies.join(' · ')}</p>
      ) : null}
      {skills.length ? (
        <dl className="resume-skills">
          {skills.map(({ label, value }, i) => (
            <div key={i} className="resume-skill">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Section>
  ) : null;

const Education = ({ labels, education }: ResumeView) =>
  education.length ? (
    <Section id="resume-education" label={labels.education}>
      <ol className="resume-roles resume-roles--education">
        {education.map(({ year, title, place }, i) => (
          <li key={i} className="resume-role">
            <p className="resume-role__dates">{year}</p>
            <div className="resume-role__body">
              <h3 className="resume-education__title">{title}</h3>
              <p className="resume-education__place">{place}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  ) : null;

/** Everything below the intro. */
export const ResumeSections = ({ content }: { content: ResumeContent }) => {
  const view = resumeView({ content });
  return (
    <>
      <Experience {...view} />
      <Skills {...view} />
      <Education {...view} />
    </>
  );
};

/**
 * The app passes the sections back as the HTML it read from the published
 * page; `resume-page-prerender` is what it looks for there.
 */
export const ResumePageBody = ({
  intro,
  body,
  onDownload,
  note,
}: {
  intro: ResumeIntro;
  body: { content: ResumeContent } | { html: string };
  onDownload?: () => void;
  /** Shown under the intro after a download. */
  note?: ReactNode;
}) => (
  <main className="resume-page resume-page-prerender">
    <IntroHeader {...intro} onDownload={onDownload} />
    {note}
    {'html' in body ? (
      <div
        className="resume-body"
        dangerouslySetInnerHTML={{ __html: body.html }}
      />
    ) : (
      <div className="resume-body">
        <ResumeSections content={body.content} />
      </div>
    )}
  </main>
);

export const ResumeUnavailableBody = () => (
  <main className="resume-page resume-page-unavailable">
    <IntroHeader
      headline={null}
      summary={RESUME_UNAVAILABLE_TEXT}
      pdfPath={null}
    />
  </main>
);
