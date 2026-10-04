import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  SITE_AUTHOR_NAME,
  SITE_FOOTER_LINKS,
  SITE_HEADER_PHOTO_SIZE,
  SITE_MENU_ID,
  SITE_MENU_LABEL,
  SITE_MENU_LINKS,
  SITE_NAV_LINKS,
  SITE_PROFILE_IMAGE_SRC,
  siteFooterCopy,
  type SiteNavHref,
} from '@gagnechris/shared/site-chrome';
import { trackEvent } from '../utils/analytics';

// Markup must stay byte-identical to `renderSiteHeaderHtml` /
// `renderSiteFooterHtml` (SiteChrome.test.tsx); `discover="none"` keeps
// React Router from adding a data attribute the prerender doesn't have.

const SiteMenu = ({ current }: { current: SiteNavHref | null }) => {
  const { pathname } = useLocation();
  // Keyed to the path, so navigating anywhere (Back included) closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const menuRef = useRef<HTMLDetailsElement>(null);
  const buttonRef = useRef<HTMLElement>(null);
  const close = () => setOpenOn(null);

  useEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current;
    // Hidden above the phone breakpoint: nothing to trap.
    if (!open || !menu || !button?.getClientRects().length) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpenOn(null);
        button.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const stops = [button, ...menu.querySelectorAll<HTMLElement>('nav a')];
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const last = stops.length - 1;
      event.preventDefault();
      if (event.shiftKey) stops[at <= 0 ? last : at - 1]!.focus();
      else stops[at === -1 || at === last ? 0 : at + 1]!.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <details className="site-menu" open={open} ref={menuRef}>
      <summary
        className="site-menu__button"
        role="button"
        aria-label={SITE_MENU_LABEL}
        aria-controls={SITE_MENU_ID}
        aria-expanded={open}
        ref={buttonRef}
        onClick={(event) => {
          event.preventDefault();
          setOpenOn(open ? null : pathname);
        }}
      />
      <nav
        className="site-menu__panel"
        id={SITE_MENU_ID}
        aria-label={SITE_MENU_LABEL}
      >
        <ul className="site-menu__list">
          {SITE_NAV_LINKS.map(({ label, href }) => (
            <li key={href}>
              <Link
                aria-current={href === current ? 'page' : undefined}
                to={href}
                discover="none"
                onClick={close}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <ul className="site-menu__more">
          {SITE_MENU_LINKS.map(({ label, href, spa, trackId }) => (
            <li key={href}>
              {spa ? (
                <Link to={href} discover="none" onClick={close}>
                  {label}
                </Link>
              ) : trackId ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    trackEvent('click', 'external_link', trackId);
                    close();
                  }}
                >
                  {label}
                </a>
              ) : (
                <a href={href} onClick={close}>
                  {label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
};

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
    <SiteMenu current={current} />
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
