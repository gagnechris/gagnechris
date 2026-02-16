import profile from './assets/profile.jpg'
import { Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { trackEvent } from './utils/analytics'
import './App.css'

function App() {
  return (
    <>
      <Helmet>
        <title>Chris Gagne - Engineering Leader</title>
        <meta
          name="description"
          content="Chris Gagne is a Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems."
        />
        <meta property="og:title" content="Chris Gagne - Engineering Leader" />
        <meta
          property="og:description"
          content="Chris Gagne is a Engineering Leader at Ro with 20+ years of experience in software engineering, building modern web technologies to solve critical business problems."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://gagnechris.com" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Chris Gagne - Engineering Leader" />
        <meta
          name="twitter:description"
          content="Chris Gagne is a Engineering Leader at Ro with 20+ years of experience in software engineering."
        />
        <link rel="canonical" href="https://gagnechris.com" />
      </Helmet>
      <header>
        <img src={profile} className="profile" alt="Photo of Chris Gagne" />
        <h1>Chris Gagne</h1>
        <p>Engineering Leader</p>
      </header>
      <main>
        <section id="about">
          <h2>About Me</h2>
          <p>
            I am the Engineering Leader at Ro. I have more than 20 years
            experience in software engineering building modern web technologies
            to solve critical business problems with a passion for using
            technology to improve the lives of everyday people.
          </p>
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
