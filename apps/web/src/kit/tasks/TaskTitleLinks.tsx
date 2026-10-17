import { findBareUrls, linkLabel } from '@gagnechris/shared';
import './taskTitleLinks.css';

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
        <a
          key={from}
          className={className}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={href}
        >
          {linkLabel(href)}
        </a>
      ))}
    </>
  );
}
