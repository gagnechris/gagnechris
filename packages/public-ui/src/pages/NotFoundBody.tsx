/** @jsxRuntime automatic */
import {
  NOT_FOUND_BEARS,
  NOT_FOUND_HEADING,
  NOT_FOUND_LABEL,
  NOT_FOUND_LINKS,
  NOT_FOUND_TEXT,
} from '@gagnechris/shared/public-pages';
import { PublicLink } from '../link.js';

export const NotFoundBody = () => (
  <main className="not-found">
    <p className="not-found__label">{NOT_FOUND_LABEL}</p>
    <h1>{NOT_FOUND_HEADING}</h1>
    <p className="not-found__text">{NOT_FOUND_TEXT}</p>
    <ul className="not-found__links">
      {NOT_FOUND_LINKS.map(({ label, href }) => (
        <li key={href}>
          <PublicLink href={href}>{label}</PublicLink>
        </li>
      ))}
    </ul>
    <p className="not-found__bears">
      <PublicLink href={NOT_FOUND_BEARS.href}>
        {NOT_FOUND_BEARS.label}
      </PublicLink>
      {NOT_FOUND_BEARS.after}
    </p>
  </main>
);
