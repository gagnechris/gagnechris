/** @jsxRuntime automatic */
import { Fragment } from 'react';
import {
  formatPostDate,
  POST_AUTHOR_NOTE,
  POST_META_SEPARATOR,
  POST_PART_OF_LABEL,
  postDateAttribute,
  postPartOfSeparator,
  postPartOfSuffix,
  readingTimeLabel,
  type PostProjectLink,
} from '@gagnechris/shared';
import type { PostArticleView } from '@gagnechris/shared/render';
import { PublicLink } from '../link.js';

const PartOfProject = ({ name, href }: PostProjectLink) =>
  href ? (
    <PublicLink className="post-part-of__project" href={href}>
      {name}
    </PublicLink>
  ) : (
    <span className="post-part-of__project">{name}</span>
  );

/** A post's body as published; the admin preview shows the draft with it. */
export const PostContent = ({ html }: { html: string }) => (
  <div
    className="post-content blog-post-body"
    dangerouslySetInnerHTML={{ __html: html }}
  />
);

const Title = ({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4;
  children: string;
}) => {
  const Heading = `h${level}` as const;
  return <Heading>{children}</Heading>;
};

/**
 * `blog-post-prerender` and `data-minutes` are what the app reads back on a
 * cold load. The title is `<h1>` on the post page; embeds pass the level that
 * fits where they sit.
 */
export const PostArticle = ({
  post,
  headingLevel = 1,
}: {
  post: PostArticleView;
  headingLevel?: 1 | 2 | 3 | 4;
}) => {
  const dateLabel = formatPostDate(post.date);
  return (
    <article className="blog-post-prerender" data-slug={post.slug}>
      <header className="post-header">
        <p className="post-meta">
          {dateLabel ? (
            <>
              <time
                className="post-date"
                dateTime={postDateAttribute(post.date) || undefined}
              >
                {dateLabel}
              </time>
              {POST_META_SEPARATOR}
            </>
          ) : null}
          <span className="post-reading-time" data-minutes={post.minutes}>
            {readingTimeLabel(post.minutes)}
          </span>
        </p>
        <Title level={headingLevel}>{post.title}</Title>
        {post.excerpt ? <p className="post-excerpt">{post.excerpt}</p> : null}
        {post.partOf.length ? (
          <p className="post-part-of">
            {`${POST_PART_OF_LABEL} `}
            {post.partOf.map((project, i) => (
              <Fragment key={i}>
                {postPartOfSeparator(i, post.partOf.length) || null}
                <PartOfProject {...project} />
              </Fragment>
            ))}
            {postPartOfSuffix(post.partOf.length)}
          </p>
        ) : null}
      </header>
      <PostContent html={post.contentHtml} />
    </article>
  );
};

const AuthorNote = () => {
  const { name, role, about, rss } = POST_AUTHOR_NOTE;
  return (
    <section className="post-author" aria-label="About the author">
      <p>
        <strong>{name}</strong>
        {` ${role} `}
        <PublicLink href={about.href}>{about.label}</PublicLink>
        {', or follow along via '}
        <PublicLink href={rss.href} spa={false}>
          {rss.label}
        </PublicLink>
        .
      </p>
    </section>
  );
};

export const PostPageBody = ({ post }: { post: PostArticleView }) => (
  <main className="post-page">
    <PostArticle post={post} />
    <AuthorNote />
  </main>
);
