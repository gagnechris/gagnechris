import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  RESUME_ACTION_LINKS,
  RESUME_DOWNLOAD_FILENAME,
  RESUME_DOWNLOAD_ICON_PATH,
  RESUME_DOWNLOAD_LABEL,
  RESUME_PAGE_TITLE,
  type ResumeActionLink,
} from '@gagnechris/shared/render';
import {
  trackEvent,
  trackResumeDownload,
  trackResumeView,
} from '../utils/analytics';
import {
  documentResumeView,
  fallbackResumeView,
  loadPublishedResume,
  type ResumeView,
} from '../resume/publishedResume';
import { createPublicApiClient } from '../api/public-client';
import './Resume.css';

// The intro must match `renderResumeIntroHtml` element for element
// (coldLoadParity.test.tsx).

const ActionLink = ({ link }: { link: ResumeActionLink }) => {
  if (link.kind === 'spa') {
    return (
      <Link className="resume-intro__link" to={link.href} discover="none">
        {link.label}
      </Link>
    );
  }
  const trackId = link.trackId;
  return (
    <a
      className="resume-intro__link"
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={
        trackId
          ? () => trackEvent('click', 'external_link', trackId)
          : undefined
      }
    >
      {link.label}
    </a>
  );
};

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
  // Null only after client-side navigation, until /resume/ arrives; never the
  // bundled default first.
  const [resume, setResume] = useState<ResumeView | null>(documentResumeView);
  const [showBearNote, setShowBearNote] = useState(false);

  useEffect(() => {
    trackResumeView();
  }, []);

  useEffect(() => {
    if (documentResumeView()) return;
    let cancelled = false;
    void loadPublishedResume()
      .catch(() => null)
      .then((published) => {
        if (!cancelled) setResume(published ?? fallbackResumeView());
      });
    return () => {
      cancelled = true;
    };
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
    <div className={`resume-page${marker}`} aria-busy={!resume || undefined}>
      <title>Resume - Chris Gagne</title>
      <link rel="canonical" href="https://gagnechris.com/resume" />
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
        <aside className="resume-bear-note" role="status">
          <p>
            Download started. While you wait —{' '}
            <Link to="/dont-feed-the-bears?from=resume">
              Don't Feed the Bears
            </Link>
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
        </aside>
      )}

      {resume?.bodyHtml ? (
        <main
          className="resume-body"
          dangerouslySetInnerHTML={{ __html: resume.bodyHtml }}
        />
      ) : null}
    </div>
  );
}

export default Resume;
