import { useEffect, useState } from 'react';
import {
  RESUME_ACTION_LINKS,
  RESUME_DOWNLOAD_FILENAME,
  RESUME_DOWNLOAD_ICON_PATH,
  RESUME_DOWNLOAD_LABEL,
  RESUME_PAGE_TITLE,
  type ResumeActionLink,
  pageTitle,
} from '@gagnechris/shared/render';
import { siteUrl } from '@gagnechris/shared';
import { trackResumeDownload, trackResumeView } from '../utils/analytics';
import {
  documentResumeView,
  fallbackResumeView,
  loadPublishedResume,
  type ResumeView,
} from '../resume/publishedResume';
import { createPublicApiClient } from '../api/public-client';
import { usePublishedView } from '../prerender/usePublishedView';
import SiteLink from '../components/SiteLink';
import './Resume.css';
import PageHead from '../components/PageHead';

// The intro must match `renderResumeIntroHtml` element for element
// (coldLoadParity.test.tsx).

const ActionLink = ({ link }: { link: ResumeActionLink }) => (
  <SiteLink
    className="resume-intro__link"
    href={link.href}
    spa={link.kind === 'spa'}
    newTab={link.kind === 'external'}
    trackId={link.trackId}
  >
    {link.label}
  </SiteLink>
);

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

function Resume() {
  const published = usePublishedView(
    'resume',
    documentResumeView,
    loadPublishedResume,
  );
  // Null only after client-side navigation, until /resume/ arrives; never the
  // bundled default first.
  const resume: ResumeView | null =
    published.status === 'ready'
      ? published.view
      : published.status === 'loading'
        ? null
        : fallbackResumeView();
  const [showBearNote, setShowBearNote] = useState(false);

  useEffect(() => {
    trackResumeView();
  }, []);

  const handleDownload = () => {
    trackResumeDownload();
    void createPublicApiClient()
      .POST('/api/resume/download', {
        body: { referrer: document.referrer || undefined },
        keepalive: true,
      })
      .catch(() => {
        /* notify is best-effort; download still proceeds */
      });
    setShowBearNote(true);
  };

  const marker = !resume
    ? ''
    : resume.unavailable
      ? ' resume-page-unavailable'
      : ' resume-page-prerender';

  return (
    <main className={`resume-page${marker}`} aria-busy={!resume || undefined}>
      <PageHead
        title={resume?.headTitle ?? pageTitle('Resume')}
        url={siteUrl('/resume')}
      />
      <header className="resume-intro">
        <h1 className="resume-intro__title">{RESUME_PAGE_TITLE}</h1>
        {resume ? (
          <>
            {resume.headline ? (
              <p className="resume-intro__headline">{resume.headline}</p>
            ) : null}
            <p className="resume-intro__summary">{resume.summary}</p>
            <p className="resume-intro__actions">
              {resume.pdfPath ? (
                <a
                  className="resume-download"
                  href={resume.pdfPath}
                  download={RESUME_DOWNLOAD_FILENAME}
                  onClick={handleDownload}
                >
                  <DownloadIcon />
                  {RESUME_DOWNLOAD_LABEL}
                </a>
              ) : null}
              {RESUME_ACTION_LINKS.map((link) => (
                <ActionLink key={link.href} link={link} />
              ))}
            </p>
          </>
        ) : null}
      </header>

      {showBearNote && (
        <div className="resume-bear-note" role="status">
          <p>
            Download started. While you wait —{' '}
            <SiteLink href="/dont-feed-the-bears?from=resume">
              Don't Feed the Bears
            </SiteLink>
            ?
          </p>
          <button
            type="button"
            className="resume-bear-note__dismiss"
            onClick={() => setShowBearNote(false)}
            aria-label="Dismiss bear game note"
          >
            ×
          </button>
        </div>
      )}

      {resume?.bodyHtml ? (
        <div
          className="resume-body"
          dangerouslySetInnerHTML={{ __html: resume.bodyHtml }}
        />
      ) : null}
    </main>
  );
}

export default Resume;
