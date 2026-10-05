import { renderProjectMarkdownToHtml } from '@gagnechris/shared/render';
import { withPublicUrls } from './publicUrl';
import '../pages/PostPage.css';
import '../pages/ProjectPage.css';
import './BodyPreview.css';

// A div, not the published page's <main>: the admin shell already has one.
export function ProjectBodyPreview({ markdown }: { markdown: string }) {
  return (
    <div className="admin-body-preview">
      <div className="project-page">
        <div className="project-main">
          <div
            className="post-content project-body"
            dangerouslySetInnerHTML={{
              __html: withPublicUrls(renderProjectMarkdownToHtml(markdown)),
            }}
          />
        </div>
      </div>
    </div>
  );
}
