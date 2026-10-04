import { Link } from 'react-router-dom';
import {
  NOT_FOUND_BEARS,
  NOT_FOUND_HEADING,
  NOT_FOUND_LABEL,
  NOT_FOUND_LINKS,
  NOT_FOUND_TEXT,
  NOT_FOUND_TITLE,
} from '@gagnechris/shared/public-pages';
import './NotFound.css';

// Markup must stay byte-identical to `renderNotFoundBodyHtml`, which is also
// the Vite 404.html prerender and the CloudFront fallback (NotFound.test.tsx).

function NotFound() {
  return (
    <main className="not-found">
      <title>{NOT_FOUND_TITLE}</title>
      <meta name="robots" content="noindex" />
      <p className="not-found__label">{NOT_FOUND_LABEL}</p>
      <h1>{NOT_FOUND_HEADING}</h1>
      <p className="not-found__text">{NOT_FOUND_TEXT}</p>
      <ul className="not-found__links">
        {NOT_FOUND_LINKS.map(({ label, href }) => (
          <li key={href}>
            <Link to={href} discover="none">
              {label}
            </Link>
          </li>
        ))}
      </ul>
      <p className="not-found__bears">
        <Link to={NOT_FOUND_BEARS.href} discover="none">
          {NOT_FOUND_BEARS.label}
        </Link>
        {NOT_FOUND_BEARS.after}
      </p>
    </main>
  );
}

export default NotFound;
