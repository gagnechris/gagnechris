/** @jsxRuntime automatic */
import {
  createContext,
  createElement,
  useContext,
  type ComponentType,
  type ReactNode,
} from 'react';

export type PublicLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  'aria-current'?: 'page';
  /** False for site paths the app doesn't route (`/rss.xml`). */
  spa?: boolean;
  newTab?: boolean;
  /** Sends the external-link click event in the app. */
  trackId?: string;
  onClick?: () => void;
};

/** The publisher's link: a plain anchor with no click handling. */
export const PlainLink = ({
  href,
  className,
  children,
  'aria-current': ariaCurrent,
  newTab,
}: PublicLinkProps) => (
  <a
    className={className}
    aria-current={ariaCurrent}
    href={href}
    target={newTab ? '_blank' : undefined}
    rel={newTab ? 'noopener noreferrer' : undefined}
  >
    {children}
  </a>
);

/**
 * The public app provides its router link; the publisher renders plain
 * anchors. Both must print the same attributes or hydration mismatches.
 */
export const PublicLinkContext =
  createContext<ComponentType<PublicLinkProps>>(PlainLink);

// createElement: the component comes from context, which the
// static-components lint rule can't see is stable.
export const PublicLink = (props: PublicLinkProps) =>
  createElement(useContext(PublicLinkContext), props);
