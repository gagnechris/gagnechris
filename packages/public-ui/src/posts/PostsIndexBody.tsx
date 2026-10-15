/** @jsxRuntime automatic */
import {
  POSTS_INDEX_EMPTY_TEXT,
  POSTS_INDEX_INTRO,
  POSTS_RSS_LINK,
  postsYearId,
  type PostsIndexEntry,
  type PostsIndexYear,
} from '@gagnechris/shared';
import { Card } from '@gagnechris/ui';
import { PublicLink } from '../link.js';

const PostPreview = ({ post }: { post: PostsIndexEntry }) => (
  <Card
    tone="editorial"
    as="li"
    className="post-preview"
    data-id={post.id}
    href={`/posts/${post.slug}`}
    linkAs={PublicLink}
    title={post.title}
    meta={
      post.date ? (
        <time
          className="post-preview__date"
          dateTime={post.dateTime || undefined}
        >
          {post.date}
        </time>
      ) : null
    }
  >
    {post.excerpt ? (
      <p className="post-preview__excerpt">{post.excerpt}</p>
    ) : null}
  </Card>
);

export const PostsIndexBody = ({
  years,
  message,
}: {
  years: readonly PostsIndexYear[];
  /** Replaces the list while loading or after an error. */
  message?: string;
}) => (
  <main className="posts-index blog-index-prerender">
    <header className="posts-index__header">
      <h1>Posts</h1>
      <p className="posts-index__intro">{POSTS_INDEX_INTRO}</p>
      <a className="posts-index__rss" href={POSTS_RSS_LINK.href}>
        {POSTS_RSS_LINK.label}
      </a>
    </header>
    <div className="posts-index__years">
      {message || !years.length ? (
        <p className="posts-index__empty">
          {message ?? POSTS_INDEX_EMPTY_TEXT}
        </p>
      ) : (
        years.map(({ year, posts }) => (
          <section
            key={year}
            className="posts-year"
            aria-labelledby={postsYearId(year)}
          >
            <h2 className="posts-year__label" id={postsYearId(year)}>
              {year}
            </h2>
            <ul className="posts-year__list">
              {posts.map((post) => (
                <PostPreview key={post.id || post.slug} post={post} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  </main>
);
