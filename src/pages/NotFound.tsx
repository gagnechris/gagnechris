import { Link } from 'react-router-dom'
import './NotFound.css'

function NotFound() {
  return (
    <div className="not-found">
      <title>Page Not Found - Chris Gagne</title>
      <meta name="robots" content="noindex" />
      <header>
        <h1>Page not found</h1>
        <Link to="/" className="back-link">
          Back to Home
        </Link>
      </header>
      <main>
        <p>That URL does not match a page on this site.</p>
        <ul className="not-found-links">
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/blog">Blog</Link>
          </li>
          <li>
            <Link to="/resume">Resume</Link>
          </li>
          <li>
            <Link to="/contact">Contact</Link>
          </li>
        </ul>
      </main>
    </div>
  )
}

export default NotFound
