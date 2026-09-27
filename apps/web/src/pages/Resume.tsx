import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { trackResumeView, trackResumeDownload } from '../utils/analytics'
import {
  fallbackResumeView,
  loadPublishedResume,
  type ResumeView,
} from '../resume/publishedResume'
import './Resume.css'

function Resume() {
  const [resume, setResume] = useState<ResumeView>(fallbackResumeView)

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
    trackResumeDownload()
    void fetch('/api/resume/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referrer: document.referrer || undefined }),
      keepalive: true,
    }).catch(() => {
      /* notify is best-effort; download still proceeds */
    })
    const link = document.createElement('a')
    link.href = resume.pdfPath
    link.download = resume.pdfPath.split('/').pop() || 'resume.pdf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="resume-page">
      <title>Resume - Chris Gagne</title>
      <link rel="canonical" href="https://gagnechris.com/resume" />
      <header>
        <div className="name-section">
          <h1>{resume.name}</h1>
        </div>
        <div className="nav-section">
          <button
            onClick={handleDownload}
            className="subtle-download"
            aria-label="Download resume as PDF"
          >
            <span className="download-icon" aria-hidden="true">↓</span>
            <span className="download-text">Resume</span>
          </button>
          <Link to="/" className="back-link">Back to Home</Link>
        </div>
      </header>

      <main dangerouslySetInnerHTML={{ __html: resume.bodyHtml }} />
    </div>
  )
}

export default Resume
