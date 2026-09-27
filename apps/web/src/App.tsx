import profile from './assets/profile.jpg'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { trackEvent } from './utils/analytics'
import {
  documentHomeView,
  fallbackHomeView,
  loadPublishedHome,
  type HomeView,
} from './home/publishedHome'
import './App.css'

function App() {
  const [home, setHome] = useState<HomeView>(
    () => documentHomeView() ?? fallbackHomeView(),
  )

  useEffect(() => {
    // A cold load on `/` already parsed the prerender out of the document.
    if (documentHomeView()) return
    let cancelled = false
    void loadPublishedHome()
      .then((published) => {
        if (published && !cancelled) {
          setHome(published)
        }
      })
      .catch(() => {
        /* fall back to the bundled default content */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const year = new Date().getFullYear()

  return (
    <div className="home-page">
      <title>{`${home.name} - ${home.title}`}</title>
      <link rel="canonical" href="https://gagnechris.com" />
      <header className="home-header">
        <img src={profile} className="profile" alt={`Photo of ${home.name}`} />
        <h1>{home.name}</h1>
        <p>{home.title}</p>
      </header>
      <main>
        <section id="about">
          <h2>About Me</h2>
          <div
            className="about-body"
            dangerouslySetInnerHTML={{ __html: home.aboutHtml }}
          />
        </section>
        <section id="quick-links">
          <h2>Quick Links</h2>
          <ul>
            <li>
              <Link to="/resume">Resume</Link>
            </li>
            <li>
              <Link to="/blog">Blog</Link>
            </li>
            <li>
              <Link to="/contact">Contact</Link>
            </li>
            <li>
              <a
                href="https://www.linkedin.com/in/christophergagne/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent('click', 'external_link', 'linkedin')}
              >
                LinkedIn
              </a>
            </li>
            <li>
              <a
                href="https://github.com/gagnechris"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent('click', 'external_link', 'github')}
              >
                GitHub
              </a>
            </li>
          </ul>
        </section>
      </main>
      <footer className="site-footer">
        <p className="site-footer__copy">© {year} Chris Gagne</p>
        <ul className="site-footer__links">
          <li>
            <a
              href="https://www.linkedin.com/in/christophergagne/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('click', 'external_link', 'linkedin_footer')}
            >
              LinkedIn
            </a>
          </li>
          <li>
            <a
              href="https://github.com/gagnechris"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('click', 'external_link', 'github_footer')}
            >
              GitHub
            </a>
          </li>
          <li>
            <a href="/rss.xml">RSS</a>
          </li>
          <li>
            <Link
              to="/dont-feed-the-bears?from=footer"
              className="site-footer__bear"
              aria-label="Don't Feed the Bears — Vermont camp mini-game"
              title="Don't Feed the Bears"
            >
              🐻 Don't Feed the Bears
            </Link>
          </li>
        </ul>
      </footer>
    </div>
  )
}

export default App
