import { renderPostMarkdownToHtml } from '@gagnechris/shared/render';
import '../pages/PostPage.css';
import './PostBodyPreview.css';

export function PostBodyPreview({ markdown }: { markdown: string }) {
  return (
    <div className="admin-post-preview">
      <div className="post-page">
        <div
          className="post-content blog-post-body"
          dangerouslySetInnerHTML={{
            __html: renderPostMarkdownToHtml(markdown),
          }}
        />
      </div>
    </div>
  );
}
