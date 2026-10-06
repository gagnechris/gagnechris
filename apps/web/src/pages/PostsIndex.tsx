import { useEffect, useState } from 'react';
import PostsIndexBody from '../posts/PostsIndexBody';
import {
  documentPostsIndex,
  fetchPublishedPosts,
  type PublishedPostListItem,
} from '../posts/publishedPosts';
import './PostsIndex.css';
import { pageTitle } from '@gagnechris/shared';
import PageHead from '../components/PageHead';

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
      <PageHead title={pageTitle('Posts')} url="https://gagnechris.com/posts" />
      <PostsIndexBody
        posts={posts ?? []}
        message={error ?? (posts ? undefined : 'Loading posts…')}
      />
    </>
  );
}

export default PostsIndex;
