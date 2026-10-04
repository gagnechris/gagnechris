import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { formatPostDate, postDateAttribute } from '@gagnechris/shared';
import { POSTS_INDEX_EMPTY_TEXT } from '@gagnechris/shared/render';
import {
  documentPostsIndex,
  fetchPublishedPosts,
  type PublishedPostListItem,
} from '../posts/publishedPosts';
import './PostsIndex.css';

const newestFirst = (
  a: PublishedPostListItem,
  b: PublishedPostListItem,
): number =>
  new Date(b.publishedAt || b.updatedAt).getTime() -
  new Date(a.publishedAt || a.updatedAt).getTime();

function PostsIndex() {
  const [posts, setPosts] = useState<PublishedPostListItem[] | null>(
    documentPostsIndex,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (documentPostsIndex()) return;
    let cancelled = false;
    void (async () => {
      try {
        const items = await fetchPublishedPosts();
        if (cancelled) return;
        setPosts([...items].sort(newestFirst));
      } catch (err) {
        console.error('Error loading posts:', err);
        if (!cancelled) {
          setError('Could not load posts.');
          setPosts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="posts-index">
      <title>Posts - Chris Gagne</title>
      <link rel="canonical" href="https://gagnechris.com/posts" />
      <link
        rel="alternate"
        type="application/rss+xml"
        title="Chris Gagne"
        href="/rss.xml"
      />
      <header>
        <h1>Posts</h1>
      </header>
      <main>
        {!posts ? <p>Loading posts...</p> : null}
        {error ? <p>{error}</p> : null}
        {posts && !error && posts.length === 0 ? (
          <p>{POSTS_INDEX_EMPTY_TEXT}</p>
        ) : null}
        {posts && posts.length > 0 ? (
          <div className="posts-list">
            {posts.map((post) => {
              const dateLabel = formatPostDate(post.publishedAt);
              const dateAttr = postDateAttribute(post.publishedAt);
              return (
                <article
                  key={post.id || post.slug}
                  className="post-preview"
                  data-id={post.id}
                >
                  <Link
                    className="post-preview__link"
                    to={`/posts/${post.slug}`}
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

export default PostsIndex;
