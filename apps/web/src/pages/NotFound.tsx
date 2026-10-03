import { Link } from 'react-router-dom';
import PublicNav from '../components/PublicNav';
import './NotFound.css';

function NotFound() {
  return (
    <div className="not-found">
      <title>Page Not Found - Chris Gagne</title>
      <meta name="robots" content="noindex" />
      <header>
        <h1>Page not found</h1>
        <PublicNav />
      </header>
      <main>
        <p>That URL does not match a page on this site.</p>
        <p className="not-found-bear">
          Lost in the woods?{' '}
          <Link to="/dont-feed-the-bears?from=404" className="tap-target-link">
            Don't feed the bears
          </Link>{' '}
          while you find your way.
        </p>
        <ul className="not-found-links">
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/writing">Writing</Link>
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
  );
}

export default NotFound;
