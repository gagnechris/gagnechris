import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isSitePath } from '@gagnechris/shared';
import { trackEvent } from '../utils/analytics';

type SiteLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
  /** Client-side navigation; site paths that the SPA doesn't route (`/rss.xml`) pass false. */
  spa?: boolean;
  newTab?: boolean;
  /** Sends the external-link click event. */
  trackId?: string;
  'aria-current'?: 'page';
  onClick?: () => void;
};

// `discover="none"` keeps React Router from adding a data attribute the
// prerendered markup doesn't have.
const SiteLink = ({
  href,
  children,
  className,
  spa = isSitePath(href),
  newTab = false,
  trackId,
  'aria-current': ariaCurrent,
  onClick,
}: SiteLinkProps) => {
  if (spa) {
    return (
      <Link
        className={className}
        aria-current={ariaCurrent}
        to={href}
        discover="none"
        onClick={onClick}
      >
        {children}
      </Link>
    );
  }
  const handleClick =
    trackId || onClick
      ? () => {
          if (trackId) trackEvent('click', 'external_link', trackId);
          onClick?.();
        }
      : undefined;
  return (
    <a
      className={className}
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      onClick={handleClick}
    >
      {children}
    </a>
  );
};

export default SiteLink;
