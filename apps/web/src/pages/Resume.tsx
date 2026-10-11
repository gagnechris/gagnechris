import { useEffect, useState } from 'react';
import { pageTitle, RESUME_PAGE_TITLE } from '@gagnechris/shared/render';
import { siteUrl } from '@gagnechris/shared';
import { ResumePageBody, ResumeUnavailableBody } from '@gagnechris/public-ui';
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

  const head = (
    <PageHead
      title={resume?.headTitle ?? pageTitle('Resume')}
      url={siteUrl('/resume')}
    />
  );

  if (!resume) {
    return (
      <main className="resume-page" aria-busy>
        {head}
        <header className="resume-intro">
          <h1 className="resume-intro__title">{RESUME_PAGE_TITLE}</h1>
        </header>
      </main>
    );
  }

  if (resume.unavailable) {
    return (
      <>
        {head}
        <ResumeUnavailableBody />
      </>
    );
  }

  return (
    <>
      {head}
      <ResumePageBody
        intro={resume}
        body={resume.body}
        onDownload={handleDownload}
        note={
          showBearNote ? (
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
          ) : null
        }
      />
    </>
  );
}

export default Resume;
