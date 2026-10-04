import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import PostArticle from '../posts/PostArticle';
import {
  documentPostView,
  loadPublishedPost,
  type PostView,
} from '../posts/publishedPost';
import NotFound from './NotFound';
import './PostPage.css';

type Loaded = { slug: string; post: PostView | null };

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
        <p className="post-loading">Loading post…</p>
      </div>
    );
  }

  if (!post) return <NotFound />;

  return (
    <>
      <title>{`${post.title} - Chris Gagne`}</title>
      <link rel="canonical" href={`https://gagnechris.com/posts/${slug}`} />
      <link
        rel="alternate"
        type="application/rss+xml"
        title="Chris Gagne"
        href="/rss.xml"
      />
      <PostArticle post={post} />
    </>
  );
}

export default PostPage;
