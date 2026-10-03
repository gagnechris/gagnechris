import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { formatPostDate, postDateAttribute } from '@gagnechris/shared';
import {
  fetchPublishedPosts,
  type PublishedPostListItem,
} from '../blog/publishedPosts';
import PublicNav from '../components/PublicNav';
import './BlogIndex.css';

function BlogIndex() {
  const [posts, setPosts] = useState<PublishedPostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await fetchPublishedPosts();
        if (cancelled) return;
        // Newest first (publisher already sorts; keep stable client-side).
        items.sort((a, b) => {
          const aTime = new Date(a.publishedAt || a.updatedAt).getTime();
          const bTime = new Date(b.publishedAt || b.updatedAt).getTime();
          return bTime - aTime;
        });
        setPosts(items);
      } catch (err) {
        console.error('Error loading posts:', err);
        if (!cancelled) {
          setError('Could not load posts.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="blog-index">
        <title>Writing - Chris Gagne</title>
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Chris Gagne"
          href="/rss.xml"
        />
        <header>
          <h1>Writing</h1>
          <PublicNav current="/writing" />
        </header>
        <main>
          <p>Loading posts...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="blog-index">
      <title>Writing - Chris Gagne</title>
      <link rel="canonical" href="https://gagnechris.com/writing" />
      <link
        rel="alternate"
        type="application/rss+xml"
        title="Chris Gagne"
        href="/rss.xml"
      />
      <header>
        <h1>Writing</h1>
        <PublicNav current="/writing" />
      </header>
      <main>
        {error ? <p>{error}</p> : null}
        {!error && posts.length === 0 ? (
          <p>No posts yet. Check back soon!</p>
        ) : null}
        {posts.length > 0 ? (
          <div className="posts-list">
            {posts.map((post) => {
              const dateLabel = formatPostDate(post.publishedAt);
              const dateAttr = postDateAttribute(post.publishedAt);
              return (
                <article key={post.id || post.slug} className="post-preview">
                  <Link
                    to={`/writing/${post.slug}`}
                    className="post-preview__link"
                  >
                    <h2>{post.title}</h2>
                    {dateLabel ? (
                      <time
                        className="post-date"
                        dateTime={dateAttr || undefined}
                      >
                        {dateLabel}
                      </time>
                    ) : null}
                    {post.excerpt ? (
                      <p className="post-excerpt">{post.excerpt}</p>
                    ) : null}
                    <span className="read-more">Read more →</span>
                  </Link>
                </article>
              );
            })}
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default BlogIndex;
