import { useDeferredValue, useMemo } from 'react';
import {
  renderPostMarkdownToHtml,
  renderProjectMarkdownToHtml,
} from '@gagnechris/shared/render';
import { withPublicUrls } from '../publicUrl';
import '../../pages/PostPage.css';
import '../../pages/ProjectPage.css';
import './BodyPreview.css';

type Kind = 'post' | 'project';

const render: Record<Kind, (markdown: string) => string> = {
  post: renderPostMarkdownToHtml,
  project: renderProjectMarkdownToHtml,
};

/** The body as its published page renders it. */
export function BodyPreview({
  kind,
  markdown,
}: {
  kind: Kind;
  markdown: string;
}) {
  const deferred = useDeferredValue(markdown);
  const html = useMemo(() => render[kind](deferred), [kind, deferred]);
  const body = (
    <div
      className={`post-content ${kind === 'post' ? 'blog-post-body' : 'project-body'}`}
      dangerouslySetInnerHTML={{ __html: withPublicUrls(html) }}
    />
  );
  return (
    <div className="admin-body-preview">
      {kind === 'post' ? (
        <div className="post-page">{body}</div>
      ) : (
        // A div, not the published page's <main>: the admin shell already has one.
        <div className="project-page">
          <div className="project-main">{body}</div>
        </div>
      )}
    </div>
  );
}
