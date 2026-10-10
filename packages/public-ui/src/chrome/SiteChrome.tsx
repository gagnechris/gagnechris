/** @jsxRuntime automatic */
import type { ReactNode, Ref } from 'react';
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
import { PublicLink } from '../link.js';

/*
 * Works without script: `<details>` opens and closes it, and CSS (`:has`)
 * stops the page scrolling. The app passes the state and adds the focus trap
 * and Escape. Browsers expose the summary as a button whose expanded state
 * comes from `<details open>`, so it carries no role or `aria-expanded`.
 */
export const SiteMenu = ({
  current,
  open = false,
  onToggle,
  onNavigate,
  menuRef,
  buttonRef,
}: {
  current: SiteNavHref | null;
  open?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  menuRef?: Ref<HTMLDetailsElement>;
  buttonRef?: Ref<HTMLElement>;
}) => (
  <details className="site-menu" open={open} ref={menuRef}>
    <summary
      className="site-menu__button"
      aria-label={SITE_MENU_LABEL}
      aria-controls={SITE_MENU_ID}
      ref={buttonRef}
      onClick={
        onToggle &&
        ((event) => {
          event.preventDefault();
          onToggle();
        })
      }
    />
    <nav
      className="site-menu__panel"
      id={SITE_MENU_ID}
      aria-label={SITE_MENU_LABEL}
    >
      <ul className="site-menu__list">
        {SITE_NAV_LINKS.map(({ label, href }) => (
          <li key={href}>
            <PublicLink
              aria-current={href === current ? 'page' : undefined}
              href={href}
              onClick={onNavigate}
            >
              {label}
            </PublicLink>
          </li>
        ))}
      </ul>
      <ul className="site-menu__more">
        {SITE_MENU_LINKS.map(({ label, href, spa, trackId }) => (
          <li key={href}>
            <PublicLink
              href={href}
              spa={spa}
              newTab={trackId !== undefined}
              trackId={trackId}
              onClick={onNavigate}
            >
              {label}
            </PublicLink>
          </li>
        ))}
      </ul>
    </nav>
  </details>
);

export const SiteHeader = ({
  current,
  menu = <SiteMenu current={current} />,
}: {
  current: SiteNavHref | null;
  /** The app's stateful `SiteMenu`; the published page's is closed. */
  menu?: ReactNode;
}) => (
  <header className="site-header">
    <PublicLink className="site-header__home" href="/">
      {/* Low priority: otherwise the server renderer puts a preload <link>
          for it inside #root, which hydration doesn't expect. */}
      <img
        className="site-header__photo"
        alt=""
        width={SITE_HEADER_PHOTO_SIZE}
        height={SITE_HEADER_PHOTO_SIZE}
        fetchPriority="low"
        src={SITE_PROFILE_IMAGE_SRC}
      />
      <span className="site-header__name">{SITE_AUTHOR_NAME}</span>
    </PublicLink>
    <nav className="site-nav" aria-label="Primary">
      <ul className="site-nav__list">
        {SITE_NAV_LINKS.map(({ label, href }) => (
          <li key={href}>
            <PublicLink
              className="site-nav__link"
              aria-current={href === current ? 'page' : undefined}
              href={href}
            >
              {label}
            </PublicLink>
          </li>
        ))}
      </ul>
    </nav>
    {menu}
  </header>
);

/** `year` is the published year on the server; the app passes the live one after hydrating. */
export const SiteFooter = ({ year }: { year: number | string }) => (
  <footer className="site-footer">
    <p className="site-footer__copy">{siteFooterCopy(year)}</p>
    <ul className="site-footer__links">
      {SITE_FOOTER_LINKS.map(({ label, href, spa }) => (
        <li key={href}>
          <PublicLink href={href} spa={spa}>
            {label}
          </PublicLink>
        </li>
      ))}
    </ul>
  </footer>
);

/** Everything inside `#root`: the chrome around one page body. */
export const SitePage = ({
  current,
  year,
  children,
}: {
  current: SiteNavHref | null;
  year: number | string;
  children?: ReactNode;
}) => (
  <>
    <SiteHeader current={current} />
    {children}
    <SiteFooter year={year} />
  </>
);
