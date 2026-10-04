import { Link } from 'react-router-dom';
import {
  SITE_AUTHOR_NAME,
  SITE_FOOTER_LINKS,
  SITE_HEADER_PHOTO_SIZE,
  SITE_NAV_LINKS,
  SITE_PROFILE_IMAGE_SRC,
  siteFooterCopy,
  type SiteNavHref,
} from '@gagnechris/shared/site-chrome';

// Markup must stay byte-identical to `renderSiteHeaderHtml` /
// `renderSiteFooterHtml` (SiteChrome.test.tsx); `discover="none"` keeps
// React Router from adding a data attribute the prerender doesn't have.

export const SiteHeader = ({ current }: { current: SiteNavHref | null }) => (
  <header className="site-header">
    <Link className="site-header__home" to="/" discover="none">
      <img
        className="site-header__photo"
        alt=""
        width={SITE_HEADER_PHOTO_SIZE}
        height={SITE_HEADER_PHOTO_SIZE}
        src={SITE_PROFILE_IMAGE_SRC}
      />
      <span className="site-header__name">{SITE_AUTHOR_NAME}</span>
    </Link>
    <nav className="site-nav" aria-label="Primary">
      <ul className="site-nav__list">
        {SITE_NAV_LINKS.map(({ label, href }) => (
          <li key={href}>
            <Link
              className="site-nav__link"
              aria-current={href === current ? 'page' : undefined}
              to={href}
              discover="none"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  </header>
);

export const SiteFooter = ({
  year = new Date().getFullYear(),
}: {
  year?: number;
}) => (
  <footer className="site-footer">
    <p className="site-footer__copy">{siteFooterCopy(year)}</p>
    <ul className="site-footer__links">
      {SITE_FOOTER_LINKS.map(({ label, href, spa }) => (
        <li key={href}>
          {spa ? (
            <Link to={href} discover="none">
              {label}
            </Link>
          ) : (
            <a href={href}>{label}</a>
          )}
        </li>
      ))}
    </ul>
  </footer>
);
