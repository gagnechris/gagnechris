import { Navigate, useLocation, useParams } from 'react-router-dom';
import { siteUrl } from '@gagnechris/shared';
import { PostPageBody } from '@gagnechris/public-ui';
import { documentPostView, loadPublishedPost } from '../posts/publishedPost';
import { usePublishedView } from '../prerender/usePublishedView';
import NotFound from './NotFound';
import './PostPage.css';
import PageHead from '../components/PageHead';
import { ReadingBar } from './ReadingBar';

function PostPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { hash } = useLocation();
  const published = usePublishedView(slug, documentPostView, loadPublishedPost);

  if (!slug.trim() || published.status === 'missing') return <NotFound />;

  if (published.status !== 'ready') {
    return (
      <main className="post-page">
        {published.status === 'error' ? (
          <p className="post-loading" role="alert">
            Could not load this post. Check your connection and try again.
          </p>
        ) : (
          <p className="post-loading">Loading post…</p>
        )}
      </main>
    );
  }

  const post = published.view;
  // The fetch followed a renamed post's 301, so show the URL it landed on.
  if (post.slug && post.slug !== slug) {
    return <Navigate to={`/posts/${post.slug}${hash}`} replace />;
  }
  return (
    <>
      <PageHead {...post.head} url={siteUrl(`/posts/${post.slug || slug}`)} />
      <PostPageBody post={post} />
      <ReadingBar title={post.title} />
    </>
  );
}

export default PostPage;
