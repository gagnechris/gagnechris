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
};

const PlainLink = ({ href, className, children }: PublicLinkProps) => (
  <a className={className} href={href}>
    {children}
  </a>
);

/**
 * The public app provides its router link; the publisher renders plain
 * anchors. Both must print the same `<a class href>` or hydration mismatches.
 */
export const PublicLinkContext =
  createContext<ComponentType<PublicLinkProps>>(PlainLink);

// createElement: the component comes from context, which the
// static-components lint rule can't see is stable.
export const PublicLink = (props: PublicLinkProps) =>
  createElement(useContext(PublicLinkContext), props);
