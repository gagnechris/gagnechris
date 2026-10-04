import { Link } from 'react-router-dom';
import {
  formatPostShortDate,
  groupPostsByYear,
  POSTS_INDEX_EMPTY_TEXT,
  POSTS_INDEX_INTRO,
  POSTS_RSS_LINK,
  postDateAttribute,
  postsYearId,
} from '@gagnechris/shared';
import type { PostsIndexItem } from '@gagnechris/shared/render';

// Markup must stay byte-identical to `renderPostsIndexBodyHtml`
// (PostsIndexBody.test.tsx).

const PostPreview = ({ post }: { post: PostsIndexItem }) => {
  const date = formatPostShortDate(post.publishedAt);
  const dateAttr = postDateAttribute(post.publishedAt);
  return (
    <li className="post-preview" data-id={post.id}>
      <Link
        className="post-preview__link"
        to={`/posts/${post.slug}`}
        discover="none"
      >
        <h3 className="post-preview__title">{post.title}</h3>
        {date ? (
          <time className="post-preview__date" dateTime={dateAttr || undefined}>
            {date}
          </time>
        ) : null}
        {post.excerpt ? (
          <p className="post-preview__excerpt">{post.excerpt}</p>
        ) : null}
      </Link>
    </li>
  );
};

const PostsIndexBody = ({
  posts,
  message,
}: {
  posts: readonly PostsIndexItem[];
  /** Replaces the list while loading or after an error. */
  message?: string;
}) => {
  const groups = groupPostsByYear(posts);
  return (
    <div className="posts-index blog-index-prerender">
      <header className="posts-index__header">
        <h1>Posts</h1>
        <p className="posts-index__intro">{POSTS_INDEX_INTRO}</p>
        <a className="posts-index__rss" href={POSTS_RSS_LINK.href}>
          {POSTS_RSS_LINK.label}
        </a>
      </header>
      <main>
        {message || !groups.length ? (
          <p className="posts-index__empty">
            {message ?? POSTS_INDEX_EMPTY_TEXT}
          </p>
        ) : (
          groups.map(({ year, posts: items }) => (
            <section
              key={year}
              className="posts-year"
              aria-labelledby={postsYearId(year)}
            >
              <h2 className="posts-year__label" id={postsYearId(year)}>
                {year}
              </h2>
              <ul className="posts-year__list">
                {items.map((post) => (
                  <PostPreview key={post.id || post.slug} post={post} />
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
    </div>
  );
};

export default PostsIndexBody;
