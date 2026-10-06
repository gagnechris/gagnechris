import { useParams } from 'react-router-dom';
import { siteUrl } from '@gagnechris/shared';
import PostArticle from '../posts/PostArticle';
import { documentPostView, loadPublishedPost } from '../posts/publishedPost';
import { usePublishedView } from '../prerender/usePublishedView';
import NotFound from './NotFound';
import './PostPage.css';
import PageHead from '../components/PageHead';

function PostPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const published = usePublishedView(slug, documentPostView, loadPublishedPost);

  if (!slug.trim() || published.status === 'missing') return <NotFound />;

  if (published.status !== 'ready') {
    return (
      <div className="post-page">
        {published.status === 'error' ? (
          <p className="post-loading" role="alert">
            Could not load this post. Check your connection and try again.
          </p>
        ) : (
          <p className="post-loading">Loading post…</p>
        )}
      </div>
    );
  }

  const post = published.view;
  return (
    <>
      <PageHead title={post.headTitle} url={siteUrl(`/posts/${slug}`)} />
      <PostArticle post={post} />
    </>
  );
}

export default PostPage;
