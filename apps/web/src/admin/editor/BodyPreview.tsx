import { useDeferredValue, useMemo } from 'react';
import { PostContent } from '@gagnechris/public-ui';
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
  return (
    <div className="admin-body-preview">
      {kind === 'post' ? (
        <div className="post-page">
          <PostContent html={withPublicUrls(html)} />
        </div>
      ) : (
        // A div, not the published page's <main>: the admin shell already has one.
        <div className="project-page">
          <div className="project-main">
            <div
              className="post-content project-body"
              dangerouslySetInnerHTML={{ __html: withPublicUrls(html) }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
