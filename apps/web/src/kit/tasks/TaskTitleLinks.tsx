import type { ReactNode } from 'react';
import { findBareUrls, linkLabel } from '@gagnechris/shared';
import './taskTitleLinks.css';

const ExternalLink = ({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) => (
  <a
    className={className}
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    title={href}
  >
    {children}
  </a>
);

/** A task title with its URLs as links in place. */
export function TaskLinkedText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const { from, to, href } of findBareUrls(text)) {
    parts.push(text.slice(at, from));
    parts.push(
      <ExternalLink key={from} href={href} className="task-embed__link">
        {text.slice(from, to)}
      </ExternalLink>,
    );
    at = to;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

/**
 * A task title's URLs as short links after it, for rows whose title is
 * itself a link or a text field and so can't hold them.
 */
export function TaskTitleLinks({
  title,
  className = 'task-title-link',
}: {
  title: string;
  className?: string;
}) {
  const urls = findBareUrls(title);
  if (urls.length === 0) return null;
  return (
    <>
      {urls.map(({ from, href }) => (
        <ExternalLink key={from} className={className} href={href}>
          {linkLabel(href)}
        </ExternalLink>
      ))}
    </>
  );
}
