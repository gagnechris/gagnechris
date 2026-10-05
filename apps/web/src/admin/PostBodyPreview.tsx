import { renderPostMarkdownToHtml } from '@gagnechris/shared/render';
import { withPublicUrls } from './publicUrl';
import '../pages/PostPage.css';
import './BodyPreview.css';

export function PostBodyPreview({ markdown }: { markdown: string }) {
  return (
    <div className="admin-body-preview">
      <div className="post-page">
        <div
          className="post-content blog-post-body"
          dangerouslySetInnerHTML={{
            __html: withPublicUrls(renderPostMarkdownToHtml(markdown)),
          }}
        />
      </div>
    </div>
  );
}
