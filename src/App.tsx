import profile from './assets/profile.jpg'
import { Link } from 'react-router-dom'
import { trackEvent } from './utils/analytics'
import './App.css'

const PAGE_TITLE = 'Chris Gagne - Engineering Leader'
const ABOUT_COPY =
  "I'm an Engineering Leader at Ro with more than 20 years of experience building modern web technologies to solve critical business problems—and a passion for using technology to improve everyday lives."

function App() {
  return (
    <>
      <title>{PAGE_TITLE}</title>
      <link rel="canonical" href="https://gagnechris.com" />
      <header>
        <img src={profile} className="profile" alt="Photo of Chris Gagne" />
        <h1>Chris Gagne</h1>
        <p>Engineering Leader</p>
      </header>
      <main>
        <section id="about">
          <h2>About Me</h2>
          <p>{ABOUT_COPY}</p>
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
    </>
  )
}

export default App
