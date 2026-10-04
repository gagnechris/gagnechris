import { Link } from 'react-router-dom';
import {
  formatPostDate,
  POST_AUTHOR_NOTE,
  POST_META_SEPARATOR,
  postDateAttribute,
  readingTimeLabel,
} from '@gagnechris/shared';
import type { PostView } from './publishedPost';

// Markup must stay byte-identical to `renderPostPageBodyHtml`
// (PostArticle.test.tsx). Single-expression text children avoid the `<!-- -->`
// separators React writes between adjacent text nodes.

const PostArticle = ({ post }: { post: PostView }) => {
  const dateLabel = formatPostDate(post.date);
  const dateAttr = postDateAttribute(post.date);
  const { name, role, about, rss } = POST_AUTHOR_NOTE;

  return (
    <div className="post-page">
      <article className="blog-post-prerender" data-slug={post.slug}>
        <header className="post-header">
          <p className="post-meta">
            {dateLabel ? (
              <>
                <time className="post-date" dateTime={dateAttr || undefined}>
                  {dateLabel}
                </time>
                {POST_META_SEPARATOR}
              </>
            ) : null}
            <span className="post-reading-time" data-minutes={post.minutes}>
              {readingTimeLabel(post.minutes)}
            </span>
          </p>
          <h1>{post.title}</h1>
          {post.excerpt ? <p className="post-excerpt">{post.excerpt}</p> : null}
        </header>
        <div
          className="post-content blog-post-body"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>
      <aside className="post-author" aria-label="About the author">
        <p>
          <strong>{name}</strong>
          {` ${role} `}
          <Link to={about.href} discover="none">
            {about.label}
          </Link>
          {', or follow along via '}
          <a href={rss.href}>{rss.label}</a>.
        </p>
      </aside>
    </div>
  );
};

export default PostArticle;
