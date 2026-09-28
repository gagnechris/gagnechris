import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { trackResumeView, trackResumeDownload } from '../utils/analytics'
import {
  fallbackResumeView,
  loadPublishedResume,
  type ResumeView,
} from '../resume/publishedResume'
import { createPublicApiClient } from '../api/public-client'
import PublicNav from '../components/PublicNav'
import './Resume.css'

function Resume() {
  const [resume, setResume] = useState<ResumeView>(fallbackResumeView)
  const [showBearNote, setShowBearNote] = useState(false)

  useEffect(() => {
    trackResumeView()
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadPublishedResume()
      .then((published) => {
        if (published && !cancelled) {
          setResume(published)
        }
      })
      .catch(() => {
        /* fall back to the bundled default content */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleDownload = () => {
    if (resume.unavailable || !resume.pdfPath) return
    trackResumeDownload()
    void createPublicApiClient()
      .POST('/api/resume/download', {
        body: { referrer: document.referrer || undefined },
      })
      .catch(() => {
        /* notify is best-effort; download still proceeds */
      })
    const link = document.createElement('a')
    link.href = resume.pdfPath
    link.download = 'Chris-Gagne-Resume.pdf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setShowBearNote(true)
  }

  return (
    <div className="resume-page" id="top">
      <title>Resume - Chris Gagne</title>
      <link rel="canonical" href="https://gagnechris.com/resume" />
      <header>
        <div className="name-section">
          <h1>{resume.name}</h1>
        </div>
        <div className="nav-section">
          {!resume.unavailable && (
            <button
              onClick={handleDownload}
              className="subtle-download"
              aria-label="Download resume as PDF"
            >
              <span className="download-icon" aria-hidden="true">↓</span>
              <span className="download-text">Resume</span>
            </button>
          )}
          <PublicNav current="/resume" />
        </div>
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

      <main dangerouslySetInnerHTML={{ __html: resume.bodyHtml }} />

      <div className="resume-page__footer-actions">
        {!resume.unavailable && (
          <button
            onClick={handleDownload}
            className="subtle-download"
            aria-label="Download resume as PDF"
          >
            <span className="download-icon" aria-hidden="true">↓</span>
            <span className="download-text">Download Resume PDF</span>
          </button>
        )}
        <a href="#top" className="back-link" onClick={(e) => {
          e.preventDefault()
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}>
          Back to top
        </a>
      </div>
    </div>
  )
}

export default Resume
