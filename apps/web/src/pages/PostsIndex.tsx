import { useEffect, useState } from 'react';
import PostsIndexBody from '../posts/PostsIndexBody';
import {
  documentPostsIndex,
  fetchPublishedPosts,
  type PublishedPostListItem,
} from '../posts/publishedPosts';
import './PostsIndex.css';

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
        if (!cancelled) setPosts(items);
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
    <>
      <title>Posts - Chris Gagne</title>
      <link rel="canonical" href="https://gagnechris.com/posts" />
      <link
        rel="alternate"
        type="application/rss+xml"
        title="Chris Gagne"
        href="/rss.xml"
      />
      <PostsIndexBody
        posts={posts ?? []}
        message={error ?? (posts ? undefined : 'Loading posts…')}
      />
    </>
  );
}

export default PostsIndex;
