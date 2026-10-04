import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { formatPostDate, postDateAttribute } from '@gagnechris/shared';
import {
  documentPostView,
  loadPublishedPost,
  type PostView,
} from '../posts/publishedPost';
import NotFound from './NotFound';
import './PostPage.css';

type Loaded = { slug: string; post: PostView | null };

const BackLink = ({ className }: { className: string }) => (
  <Link className={className} to="/posts">
    ← Back to Posts
  </Link>
);

function PostPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(() => {
    const post = slug ? documentPostView(slug) : null;
    return post ? { slug, post } : null;
  });
  const loadedSlug = loaded?.slug;

  useEffect(() => {
    if (!slug.trim() || loadedSlug === slug) return;
    let cancelled = false;
    void loadPublishedPost(slug)
      .catch((err: unknown) => {
        console.error('Error loading post:', err);
        return null;
      })
      .then((post) => {
        if (!cancelled) setLoaded({ slug, post });
      });
    return () => {
      cancelled = true;
    };
  }, [slug, loadedSlug]);

  if (!slug.trim()) return <NotFound />;

  const post = loaded?.slug === slug ? loaded.post : undefined;

  if (post === undefined) {
    return (
      <div className="post-page">
        <header>
          <BackLink className="back-link" />
        </header>
        <main>
          <p>Loading post...</p>
        </main>
      </div>
    );
  }

  if (!post) return <NotFound />;

  const dateLabel = formatPostDate(post.date);
  const dateAttr = postDateAttribute(post.date);

  return (
    <div className="post-page">
      <title>{`${post.title} - Chris Gagne`}</title>
      <link rel="canonical" href={`https://gagnechris.com/posts/${slug}`} />
      <link
        rel="alternate"
        type="application/rss+xml"
        title="Chris Gagne"
        href="/rss.xml"
      />
      <header>
        <BackLink className="back-link" />
      </header>
      <article>
        <h1>{post.title}</h1>
        {dateLabel ? (
          <time className="post-date" dateTime={dateAttr || undefined}>
            {dateLabel}
          </time>
        ) : null}
        <div
          className="post-content"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>
      <footer>
        <BackLink className="back-link-footer" />
      </footer>
    </div>
  );
}

export default PostPage;
