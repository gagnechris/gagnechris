import { pageTitle, siteUrl } from '@gagnechris/shared';
import { PostsIndexBody } from '@gagnechris/public-ui';
import { documentPostsIndex, loadPostsIndex } from '../posts/publishedPosts';
import { usePublishedView } from '../prerender/usePublishedView';
import './PostsIndex.css';
import PageHead from '../components/PageHead';

function PostsIndex() {
  const published = usePublishedView(
    'posts',
    documentPostsIndex,
    loadPostsIndex,
  );

  return (
    <>
      <PageHead title={pageTitle('Posts')} url={siteUrl('/posts')} />
      <PostsIndexBody
        years={published.status === 'ready' ? published.view : []}
        message={
          published.status === 'loading'
            ? 'Loading posts…'
            : published.status === 'ready'
              ? undefined
              : 'Could not load posts.'
        }
      />
    </>
  );
}

export default PostsIndex;
